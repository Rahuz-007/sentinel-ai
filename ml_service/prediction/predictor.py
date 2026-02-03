import os
import numpy as np
import tensorflow as tf
from collections import deque
import sys

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from ml_service.preprocessing.image_processor import preprocess_frame



import cv2
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

# Constants
MODEL_PATH = os.path.join(os.path.dirname(__file__), '../model/cnn_model.h5')
CLASSES = ['Fighting', 'Assault', 'Normal']
WINDOW_SIZE = 30 # Increased from 10 to 30 for smoother prediction


class Predictor:
    def __init__(self):
        self.model = None
        self.person_model = None
        self.demo_class = None
        
        # Session states: {session_id: {state_vars}}
        self.sessions = {}
        
        self.load_model()
        
    def _get_session_state(self, session_id):
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "prediction_window": deque(maxlen=WINDOW_SIZE),
                "prev_frame_gray": None,
                "prev_person_boxes": [],
                "temporal_violence_score": 0.0,
                "last_reason": "Initializing session...",
                "last_active": time.time()
            }
        self.sessions[session_id]["last_active"] = time.time()
        return self.sessions[session_id]

    def cleanup_old_sessions(self, max_idle=300):
        current_time = time.time()
        expired = [sid for sid, state in self.sessions.items() if current_time - state["last_active"] > max_idle]
        for sid in expired:
            del self.sessions[sid]
        if expired:
            print(f"🧹 Cleaned up {len(expired)} idle ML sessions.")
        
        # Initialize YOLO (Lazy load or immediate)
        if YOLO:
            try:
                self.person_model = YOLO("yolov8n.pt")
                print("YOLOv8 Person Detector loaded.")
            except Exception as e:
                print(f"Warning: Could not load YOLO: {e}")
        else:
            print("Ultralytics module not found. Human detection disabled. (Wait for pip install)")

    def set_demo_mode(self, behavior_class):
        if behavior_class in CLASSES or behavior_class is None:
            self.demo_class = behavior_class
            print(f"Demo mode set to: {self.demo_class}")
            return True
        return False

    def load_model(self):
        try:
            if os.path.exists(MODEL_PATH):
                self.model = tf.keras.models.load_model(MODEL_PATH)
                print("Model loaded successfully.")
            else:
                print(f"Model not found at {MODEL_PATH}. Please train the model first.")
                # Ensure structure exists even if model doesn't (prevent crash on init)
        except Exception as e:
            print(f"Error loading model: {e}")

    def predict_frame(self, frame, session_id="default"):
        state = self._get_session_state(session_id)
        
        if self.demo_class:
            predicted_class = self.demo_class
            confidence = 0.95 + (np.random.random() * 0.04) 
            
            state["prediction_window"].append(predicted_class)
            risk_level = self.calculate_risk(session_id)
            
            return {
                "class": predicted_class,
                "confidence": confidence,
                "risk": risk_level
            }

        if self.model is None:
            # Fallback for demo if model isn't trained
            return {"class": "Normal", "confidence": 0.0, "risk": "Low"}

        # 1. Color Space Conversion (BGR -> RGB)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1.5 Center Crop (Focus on the phone screen/center action)
        # If the user holds a phone, it's likely in the center. 
        # Accessing full Webcam FOV (640x480) resized to 64x64 loses detail.
        h, w, _ = frame_rgb.shape
        center_h, center_w = h // 2, w // 2
        # Crop 300x300 from center (matches frontend canvas size roughly)
        crop_size = min(h, w, 480) 
        start_h = max(0, center_h - crop_size // 2)
        start_w = max(0, center_w - crop_size // 2)
        frame_cropped = frame_rgb[start_h:start_h+crop_size, start_w:start_w+crop_size]

        # 2. CLAHE REMOVED
        # CLAHE was amplifying noise on static backgrounds (walls), causing false positives.
        # Reverting to simple center crop.
        final_frame = frame_cropped

        # 3. Motion Gating
        gray = cv2.cvtColor(final_frame, cv2.COLOR_RGB2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        
        motion_score = 0
        if state["prev_frame_gray"] is not None:
             delta_frame = cv2.absdiff(state["prev_frame_gray"], gray)
             motion_score = np.mean(delta_frame)
        
        state["prev_frame_gray"] = gray

        # Debug Motion
        # print(f"Motion Score: {motion_score:.2f}")

        processed_frame = preprocess_frame(final_frame)
        if processed_frame is None:
            return None

        preds = self.model.predict(processed_frame, verbose=0)
        
        # AGGRESSIVE MODE:
        # Instead of just taking argmax, check if Fighting/Assault has ANY significant activation
        # Standard Softmax/Argmax suppresses lower confidence classes
        fighting_conf = float(preds[0][0]) # Assuming 0=Fighting (Alphabetical: Assault, Fighting, Normal)? 
        # WAIT! CLASSES = ['Fighting', 'Assault', 'Normal'] (Defined at top)
        # So 0=Fighting, 1=Assault, 2=Normal
        
        fighting_prob = float(preds[0][0])
        assault_prob = float(preds[0][1])
        normal_prob = float(preds[0][2])
        
        # --- HUMAN DETECTION & DEEP SPATIAL ANALYSIS ---
        num_persons = 0
        current_boxes = []
        proximity_warning = False
        high_energy_interaction = False
        postures = [] # List of 'standing', 'sitting/sitting-close', 'unclear'
        
        if self.person_model:
            # Use persist=True for internal tracking if needed, but we'll do centroid velocity
            results = self.person_model(frame, classes=[0], verbose=False)
            boxes = results[0].boxes
            num_persons = len(boxes)
            
            for box in boxes:
                xyxy = box.xyxy[0].cpu().numpy()
                current_boxes.append(xyxy)
                
                # Posture Estimation (Simplified)
                bw, bh = xyxy[2] - xyxy[0], xyxy[3] - xyxy[1]
                aspect_ratio = bh / (bw + 1e-6)
                if aspect_ratio > 1.8:
                    postures.append("standing")
                elif aspect_ratio > 1.0:
                    postures.append("standing/sitting")
                else:
                    postures.append("crouching/sitting")
                
            # 1. Proximity & Interaction Analysis
            if num_persons >= 2:
                for i in range(num_persons):
                    for j in range(i + 1, num_persons):
                        b1, b2 = current_boxes[i], current_boxes[j]
                        area1 = (b1[2]-b1[0]) * (b1[3]-b1[1])
                        area2 = (b2[2]-b2[0]) * (b2[3]-b2[1])
                        
                        # Size Ratio Check (Filter out phone screens/small artifacts)
                        # If one box is < 15% the size of the other, it's likely an object/screen
                        ratio = min(area1, area2) / (max(area1, area2) + 1e-6)
                        if ratio < 0.15:
                            continue

                        # Containment Check (Is one box inside the other?)
                        # (e.g. detecting a head or a phone as a separate person)
                        def is_contained(inner, outer):
                            return inner[0] > outer[0] and inner[1] > outer[1] and \
                                   inner[2] < outer[2] and inner[3] < outer[3]
                        
                        if is_contained(b1, b2) or is_contained(b2, b1):
                            continue

                        # Calculate Distance between centers
                        c1 = [(b1[0] + b1[2])/2, (b1[1] + b1[3])/2]
                        c2 = [(b2[0] + b2[2])/2, (b2[1] + b2[3])/2]
                        dist = np.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2)
                        
                        avg_h = ((b1[3]-b1[1]) + (b2[3]-b2[1])) / 2
                        rel_dist = dist / (avg_h + 1e-6)
                        
                        if rel_dist < 0.85: # Require closer proximity to trigger
                            proximity_warning = True
            
            # 2. Velocity Tracking (Energy)
            if len(state["prev_person_boxes"]) > 0 and num_persons > 0:
                max_displacement = 0
                for curr in current_boxes:
                    c_curr = [(curr[0]+curr[2])/2, (curr[1]+curr[3])/2]
                    min_d = float('inf')
                    for prev in state["prev_person_boxes"]:
                        c_prev = [(prev[0]+prev[2])/2, (prev[1]+prev[3])/2]
                        d = np.sqrt((c_curr[0]-c_prev[0])**2 + (c_curr[1]-c_prev[1])**2)
                        if d < min_d: min_d = d
                    
                    if min_d != float('inf'):
                        max_displacement = max(max_displacement, min_d)
                
                if max_displacement > 45: 
                    high_energy_interaction = True
                            
            state["prev_person_boxes"] = current_boxes

        # --- MULTI-FACTOR MOTION SCORING ---
        has_motion = motion_score > 3.5 # Increased from 2.5
        is_dynamic = has_motion and (high_energy_interaction or motion_score > 12.0) # Increased from 8.0
        
        # --- SCENE UNDERSTANDING & CLASSIFICATION RULES ---
        reason = "Normal Activity"
        is_violent_candidate = False
        
        combined_violence = fighting_prob + assault_prob
        
        # Rule 0: Significant Person Count
        # Only count people who are at least 5% of the frame area
        significant_persons = 0
        frame_area = frame.shape[0] * frame.shape[1]
        for box in current_boxes:
            if ((box[2]-box[0]) * (box[3]-box[1])) / (frame_area + 1e-6) > 0.05:
                significant_persons += 1

        # Rule 1: No persons or single person = Very high bar for violence
        if num_persons == 0:
            reason = "Static scene - No persons"
        elif num_persons == 1:
            if is_dynamic and combined_violence > 0.92: # Only very obvious fighting (self-harm/shadow boxing)
                is_violent_candidate = True
                reason = "High energy single-person activity"
            else:
                reason = "Normal single-person scene"
        # Rule 2: Static interaction = Normal (Sitting/Talking close)
        elif proximity_warning and not is_dynamic:
            reason = "Normal proximity / Static interaction"
        # Rule 3: Crowd Presence check (No aggression)
        elif num_persons >= 3 and not is_dynamic and combined_violence < 0.8:
            reason = "Stable crowd presence"
        # Rule 4: Violent Indicators Present
        elif is_dynamic:
            if proximity_warning:
                reason = "Aggressive interaction detected"
                # NEW: If spatial interaction is clear, lower the confidence bar from 0.75 to 0.40
                if combined_violence > 0.40:
                    is_violent_candidate = True
            else:
                reason = "High motion detected"
                if combined_violence > 0.85:
                    is_violent_candidate = True
        # Rule 5: Screen glare / artifact check
        elif not is_dynamic and combined_violence > 0.85:
            reason = "Filtered: Static pattern (Glare/Artifact)"
        else:
            reason = "Normal movements"

        # --- TEMPORAL REASONING & CONFIDENCE GRADIENT ---
        # Gradually increase if candidate is violent, decay if not
        # NEW: Sensitive build-up if proximity is clear
        threshold_to_build = 0.35 if (is_violent_candidate and proximity_warning) else 0.65
        
        if is_violent_candidate and combined_violence > threshold_to_build:
             state["temporal_violence_score"] = min(1.0, state["temporal_violence_score"] + 0.25)
        else:
             state["temporal_violence_score"] = max(0.0, state["temporal_violence_score"] - 0.15)
             
        predicted_class = "Normal"
        confidence = normal_prob
        
        if state["temporal_violence_score"] > 0.7:
             # Confirmed persistence
             if combined_violence > (normal_prob + 0.15): 
                  if fighting_prob > assault_prob:
                      predicted_class = "Fighting"
                      confidence = fighting_prob
                  else:
                      predicted_class = "Assault"
                      confidence = assault_prob
             else:
                  reason = "Ambiguous pattern - suppressing"
        
        # Update sliding window
        state["prediction_window"].append(predicted_class)
        state["last_reason"] = reason
        
        # Risk Logic
        risk_level = self.calculate_risk(session_id)
        
        return {
            "class": predicted_class,
            "confidence": confidence,
            "risk": risk_level,
            "reason": reason,
            "debug_probs": {"fighting": fighting_prob, "assault": assault_prob, "normal": normal_prob},
            "motion": motion_score,
            "persons": num_persons,
            "threshold": 0.70, # Temporal trigger threshold
            "boxes": [box.tolist() for box in current_boxes]
        }

    def calculate_risk(self, session_id="default"):
        state = self._get_session_state(session_id)
        if len(state["prediction_window"]) < 1:
            return "Low"
            
        # Count occurrences of violent classes
        violent_count = 0
        for p in state["prediction_window"]:
            if p in ['Fighting', 'Assault']:
                violent_count += 1
        
        # HIGH SENSITIVITY: 
        # If we see violence in just 10% of frames (3 out of 30), flag it.
        # This ensures we catch brief glimpses of the phone screen.
        # HIGH SENSITIVITY w/ SAFETY: 
        # If we see violence in > 15% of frames (5 out of 30), flag it.
        # Increased from 3 to 5 to ensure it's not just noise.
        if violent_count >= 5:
            return "High"
        elif violent_count >= 1:
            return "Medium"
        else:
            return "Low"

    def predict_video_detailed(self, video_path):
        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if fps == 0: fps = 15 # Fallback
        
        frame_count = 0
        events = []
        current_event = None
        self.sustained_violence_counter = 0
        self.prediction_window.clear()
        self.temporal_violence_score = 0.0
        self.prev_frame_gray = None
        self.prev_person_boxes = []
        
        process_every = max(1, int(fps / 2)) 
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            if frame_count % process_every == 0:
                res = self.predict_frame(frame)
                res['frame_index'] = frame_count
                res['timestamp'] = round(frame_count / fps, 2)
                
                is_violent = res['class'] != 'Normal'
                if is_violent:
                    if current_event is None:
                        current_event = {
                            "start_time": res['timestamp'],
                            "start_frame": frame_count,
                            "type": res['class'],
                            "max_confidence": res['confidence'],
                            "avg_confidence": res['confidence'],
                            "count": 1,
                            "humans_present": res['persons'] > 0
                        }
                    else:
                        current_event["end_time"] = res['timestamp']
                        current_event["end_frame"] = frame_count
                        current_event["max_confidence"] = max(current_event["max_confidence"], res['confidence'])
                        current_event["avg_confidence"] = (current_event["avg_confidence"] * current_event["count"] + res['confidence']) / (current_event["count"] + 1)
                        current_event["count"] += 1
                        if res['persons'] > 0: current_event["humans_present"] = True
                else:
                    if current_event:
                        if current_event["count"] >= 2:
                            events.append(current_event)
                        current_event = None
            frame_count += 1
            
        if current_event: events.append(current_event)
        cap.release()
        
        high_risk = any(e for e in events if e['avg_confidence'] > 0.4 or e['count'] > 5)
        filtered_events = [e for e in events if e['count'] >= 2]
        
        return {
            "summary": {
                "risk_level": "High" if high_risk else ("Medium" if filtered_events else "Low"),
                "total_duration": round(total_frames / fps, 2),
                "event_count": len(filtered_events)
            },
            "events": filtered_events
        }

    def predict_youtube(self, youtube_url):
        import yt_dlp
        import tempfile
        import shutil
        
        temp_dir = tempfile.mkdtemp()
        video_file = os.path.join(temp_dir, 'yt_video.mp4')
        
        ydl_opts = {
            'format': 'best[height<=360]/worst',
            'outtmpl': video_file,
            'quiet': True,
            'no_warnings': True
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([youtube_url])
                
                if not os.path.exists(video_file):
                    # Try to find if it was saved with a different extension
                    files = os.listdir(temp_dir)
                    if files:
                        video_file = os.path.join(temp_dir, files[0])
                        
                results = self.predict_video_detailed(video_file)
                # Cleanup
                shutil.rmtree(temp_dir)
                return results
        except Exception as e:
            print(f"YouTube Error: {e}")
            if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
            return {"error": str(e)}

    def predict_video(self, video_path):
        results = self.predict_video_detailed(video_path)
        risk = results['summary']['risk_level']
        behavior = results['events'][0]['type'] if results['events'] else "Normal"
        return risk, behavior

# Singleton instance
predictor = Predictor()
