import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
try:
    from twilio.rest import Client as TwilioClient
    _TWILIO_OK = True
except ImportError:
    TwilioClient = None
    _TWILIO_OK = False
    print("⚠️  twilio not installed — SMS alerts disabled")

import cv2
import time
import logging

# Use the same logger as app.py
logger = logging.getLogger(__name__)

class AlertSystem:
    def __init__(self):
        # Email Config
        self.email_sender = os.getenv('EMAIL_SENDER')
        self.email_password = os.getenv('EMAIL_PASSWORD') # App Password or SendGrid API Key
        self.email_receiver = os.getenv('EMAIL_RECEIVER')
        self.use_sendgrid = os.getenv('USE_SENDGRID', 'false').lower() == 'true'
        
        # Twilio Config
        self.twilio_sid = os.getenv('TWILIO_SID')
        self.twilio_auth_token = os.getenv('TWILIO_AUTH_TOKEN')
        self.twilio_phone = os.getenv('TWILIO_PHONE')
        self.admin_phone = os.getenv('ADMIN_PHONE')

        self.last_alert_time = 0
        self.cooldown_seconds = 30 # Reduced for testing feedback

    def send_email(self, subject, body, frame=None, video_path=None):
        if not self.email_sender or not self.email_password:
            logger.warning("Alert System: Email credentials not found. Skipping email.")
            return False

        # Create message
        msg = MIMEMultipart()
        msg['Subject'] = subject
        msg['From'] = self.email_sender
        msg['To'] = self.email_receiver
        msg.attach(MIMEText(body, 'plain'))

        # Attach image snapshot if provided
        if frame is not None:
            try:
                ret, buffer = cv2.imencode('.jpg', frame)
                if ret:
                    image_attachment = MIMEImage(buffer.tobytes())
                    image_attachment.add_header('Content-Disposition', 'attachment', filename="alert_snapshot.jpg")
                    msg.attach(image_attachment)
            except Exception as e:
                logger.error(f"Failed to attach image: {e}")

        # Attach video clip if provided
        if video_path and os.path.exists(video_path):
            try:
                from email.mime.base import MIMEBase
                from email import encoders
                
                with open(video_path, "rb") as f:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{os.path.basename(video_path)}"')
                    msg.attach(part)
                logger.info(f"Video clip attached to email: {video_path}")
            except Exception as e:
                logger.error(f"Failed to attach video: {e}")

        try:
            # Detect SMTP server
            host = 'smtp.sendgrid.net' if self.use_sendgrid else 'smtp.gmail.com'
            port = 587 # STARTTLS standard
            
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                # For SendGrid, username is ALWAYS 'apikey'
                username = 'apikey' if self.use_sendgrid else self.email_sender
                server.login(username, self.email_password)
                server.send_message(msg)
            
            logger.info(f"Alert Email sent via {'SendGrid' if self.use_sendgrid else 'Gmail'}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    def send_sms(self, body):
        if not self.twilio_sid or not self.twilio_auth_token or not self.admin_phone:
            logger.warning("Alert System: Twilio credentials not configured. Skipping SMS.")
            return False
            
        if not _TWILIO_OK:
            logger.warning("Twilio not installed — SMS skipped")
            return False
        try:
            client = TwilioClient(self.twilio_sid, self.twilio_auth_token)

            message = client.messages.create(
                body=body,
                from_=self.twilio_phone,
                to=self.admin_phone
            )
            logger.info(f"SMS Alert sent: {message.sid}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SMS: {e}")
            return False

    def trigger_alert(self, behavior, risk_level, timestamp, video_source="Webcam", frame=None, video_path=None, location=None):
        if risk_level != "High":
            return

        current_time = time.time()
        # Cooldown check for fast webcam predictions
        if not video_path: # Video uploads bypass cooldown as they are distinct events
            if current_time - self.last_alert_time < self.cooldown_seconds:
                return
            self.last_alert_time = current_time

        logger.info(f"🚨 TRIGGERED: {behavior} at {timestamp}")

        # Construct Map Link
        map_link = ""
        if location and 'lat' in location and 'lon' in location:
            map_link = f"https://www.google.com/maps?q={location['lat']},{location['lon']}"

        subject = f"🚨 URGENT: {behavior} Detected!"
        body = f"""
        HIGH RISK ALERT - Sentinel AI
        ---------------------------
        Behavior: {behavior}
        Risk Level: {risk_level}
        Timestamp: {timestamp}
        Location/Source: {video_source}
        """
        
        if map_link:
            body += f"\n📍 LIVE GPS LOCATION: {map_link}\n"
            
        body += f"""
        System Note: Review the attached media from the event.
        Please check the dashboard immediately to verify and take action.
        """
        
        email_ok = self.send_email(subject, body, frame=frame, video_path=video_path)
        
        sms_text = f"Sentinel AI Alert: {behavior} detected at {timestamp}."
        if map_link:
            sms_text += f" Location: {map_link}"
            
        sms_text += "\n\nPlease check the dashboard for more options."
            
        self.send_sms(sms_text)
