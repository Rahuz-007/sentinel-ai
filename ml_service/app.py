from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import cv2
import base64
import os
import sys
import datetime
import logging

# Configure logging FIRST
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(__file__), "ml_service.log")),
        logging.StreamHandler(sys.stdout)
    ]
)

# app.py runs from ml_service/ — prediction/ and utils/ are direct sub-packages
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from prediction.predictor import predictor
from utils.alert_system import AlertSystem

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}) # Enable CORS for Frontend

# Replace print with logging.info
def log_info(msg):
    logging.info(msg)
    print(msg)

alert_system = AlertSystem()

@app.route('/health', methods=['GET'])
@app.route('/test', methods=['GET'])
def test_connection():
    return jsonify({"status": "ok", "service": "Sentinel AI ML Service", "version": "4.0.0",
                    "engine": "PyTorch + YOLOv8-Pose (Multi-Evidence Fusion)",
                    "model_loaded": predictor.classifier is not None,
                    "yolo_loaded":  predictor.pose_model is not None})

@app.route('/test-alert', methods=['GET'])
def test_alert():
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    alert_system.trigger_alert("TEST_DETECTION", "High", timestamp, "System Test Loopback")
    return jsonify({"status": "sent", "message": "Test alert triggered. Check console/logs for results."})

@app.route('/send-video-alert', methods=['POST'])
def send_video_alert():
    try:
        # Check for video file
        if 'video' not in request.files:
            return jsonify({"error": "No video file provided"}), 400
        
        video_file = request.files['video']
        behavior = request.form.get('behavior', 'Suspicious Activity')
        timestamp = request.form.get('timestamp', datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        source = request.form.get('source', 'Live Auto-Capture')

        # Save temporarily
        temp_path = os.path.join(os.path.dirname(__file__), "temp_incident.webm")
        video_file.save(temp_path)
        
        # Trigger alert with video
        alert_system.trigger_alert(behavior, "High", timestamp, source, video_path=temp_path)
        
        # Clean up
        if os.path.exists(temp_path):
            # Give SMAL but of time for email thread to finish reading
            pass 
            
        return jsonify({"status": "ok", "message": "Video alert processing started"})
        
    except Exception as e:
        logging.error(f"Error in send_video_alert: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/demo_mode', methods=['POST'])
def set_demo_mode():
    data = request.json
    behavior = data.get('behavior') # 'Fighting', 'Assault', or 'Normal'
    
    if behavior == 'None' or not behavior:
        predictor.set_demo_mode(None)
        return jsonify({"message": "Demo mode disabled"})
    
    if predictor.set_demo_mode(behavior):
        return jsonify({"message": f"Demo mode enabled for {behavior}"})
    else:
        return jsonify({"error": "Invalid behavior class"}), 400

@app.route('/predict/webcam', methods=['POST'])
def predict_webcam():
    try:
        data = request.json
        frame_data = data.get('frame')
        location = data.get('location') # Extract GPS
        session_id = data.get('session_id', 'default')

        # Periodic cleanup of idle sessions (1% chance per request to keep it simple)
        if np.random.random() < 0.01:
            predictor.cleanup_old_sessions()

        if not frame_data:
            return jsonify({"error": "No frame provided"}), 400

        # Decode base64
        if ',' in frame_data:
            frame_data = frame_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(frame_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({"error": "Decoding failed"}), 400

        result = predictor.predict_frame(frame, session_id=session_id)
        if result is None:
             return jsonify({"error": "Prediction failed"}), 500
        
        # Check for alert trigger
        if result['risk'] == 'High':
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            alert_system.trigger_alert(result['class'], "High", timestamp, "Webcam Live Feed", frame=frame, location=location)
        
        return jsonify(result)

    except Exception as e:
        print(f"Error in webcam prediction: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/predict/video', methods=['POST'])
def predict_video():
    try:
        data = request.json
        video_path = data.get('video_path')
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({"error": "Invalid video path"}), 400

        # Use new detailed method
        results = predictor.predict_video_detailed(video_path)
        
        if results['summary']['risk_level'] == 'High':
             timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
             behavior = next((e['type'] for e in results['events']), "Unknown")
             alert_system.trigger_alert(behavior, "High", timestamp, f"Video: {os.path.basename(video_path)}")

        return jsonify(results)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/predict/youtube', methods=['POST'])
def predict_youtube():
    try:
        data = request.json
        url = data.get('youtube_url')
        
        if not url:
            return jsonify({"error": "No YouTube URL provided"}), 400

        results = predictor.predict_youtube(url)
        
        if results.get('summary', {}).get('risk_level') == 'High':
             timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
             alert_system.trigger_alert("Violence", "High", timestamp, "YouTube Video")

        return jsonify(results)

    except Exception as e:
        print(f"Error in youtube prediction: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
