"""
Sentinel AI — Core Predictor v3.0 (PyTorch Edition)
=====================================================
Fully rewritten to use PyTorch + torchvision MobileNetV2
(TensorFlow removed — not compatible with Python 3.14+)

Detection engine:
  • YOLOv8n   — person detection + bounding boxes
  • MobileNetV2 (PyTorch) — violence classification
  • Optical flow  — motion intensity (Farnebäck)
  • Spatial rules — proximity, velocity, overlap analysis
  • Temporal scoring — requires persistence across frames
"""

import os, sys, time, cv2
import numpy as np
from collections import deque

# ── Path setup ─────────────────────────────────────────────────
_PREDICTION_DIR = os.path.dirname(os.path.abspath(__file__))
_ML_SERVICE_DIR = os.path.dirname(_PREDICTION_DIR)
if _ML_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _ML_SERVICE_DIR)

# ── PyTorch ────────────────────────────────────────────────────
import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

# ── YOLOv8 ─────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
    _YOLO_OK = True
except ImportError:
    _YOLO_OK = False
    print("⚠️  ultralytics not installed — spatial analysis disabled")

# ── Constants ──────────────────────────────────────────────────
MODEL_PATH  = os.path.join(_ML_SERVICE_DIR, "model", "violence_model.pt")
CLASSES     = ["Fighting", "Assault", "Normal"]
IMG_SIZE    = 224          # MobileNetV2 standard
WINDOW_SIZE = 30           # rolling prediction window
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"

# ── Preprocessing transform ────────────────────────────────────
_TRANSFORM = T.Compose([
    T.ToPILImage(),
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std =[0.229, 0.224, 0.225]),
])


# ══════════════════════════════════════════════════════════════
#  MODEL DEFINITION
# ══════════════════════════════════════════════════════════════
class ViolenceClassifier(nn.Module):
    """
    MobileNetV2 backbone + custom 3-class head.
    Output indices: 0=Fighting  1=Assault  2=Normal
    """
    def __init__(self, num_classes: int = 3):
        super().__init__()
        base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
        # Replace classifier
        in_features = base.classifier[1].in_features
        base.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(in_features, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes),
        )
        self.model = base

    def forward(self, x):
        return self.model(x)


# ══════════════════════════════════════════════════════════════
#  PREDICTOR
# ══════════════════════════════════════════════════════════════
class Predictor:
    def __init__(self):
        self.classifier   = None
        self.person_model = None
        self.demo_class   = None
        self.sessions     = {}

        self._load_classifier()
        self._load_yolo()

    # ── Model Loading ─────────────────────────────────────────
    def _load_classifier(self):
        """
        Load fine-tuned model if it exists; otherwise load
        ImageNet-pretrained MobileNetV2 as a strong baseline.
        """
        self.classifier = ViolenceClassifier(num_classes=3).to(DEVICE)

        if os.path.exists(MODEL_PATH):
            try:
                state = torch.load(MODEL_PATH, map_location=DEVICE,
                                   weights_only=True)
                self.classifier.load_state_dict(state)
                print(f"✅ Fine-tuned violence model loaded: {MODEL_PATH}")
            except Exception as e:
                print(f"⚠️  Could not load fine-tuned weights ({e}) "
                      f"— using ImageNet pretrained baseline")
        else:
            print(f"ℹ️  No fine-tuned model at {MODEL_PATH}")
            print("   Using ImageNet-pretrained MobileNetV2 as baseline.")
            print("   Run:  python training/train_model.py  to train.")

        self.classifier.eval()

    def load_model(self):
        """Hot-reload after retraining."""
        self._load_classifier()

    def _load_yolo(self):
        if _YOLO_OK:
            try:
                self.person_model = YOLO("yolov8n.pt")
                print("✅ YOLOv8n person detector ready")
            except Exception as e:
                print(f"⚠️  YOLO error: {e}")

    # ── Demo & Session ────────────────────────────────────────
    def set_demo_mode(self, behavior_class):
        if behavior_class in CLASSES or behavior_class is None:
            self.demo_class = behavior_class
            return True
        return False

    def _get_session(self, sid: str) -> dict:
        if sid not in self.sessions:
            self.sessions[sid] = {
                "window":    deque(maxlen=WINDOW_SIZE),
                "prev_gray": None,
                "prev_boxes": [],
                "temp_score": 0.0,
                "last_active": time.time(),
            }
        self.sessions[sid]["last_active"] = time.time()
        return self.sessions[sid]

    def cleanup_old_sessions(self, max_idle: float = 300.0):
        now = time.time()
        dead = [s for s, v in self.sessions.items()
                if now - v["last_active"] > max_idle]
        for s in dead:
            del self.sessions[s]

    # ════════════════════════════════════════════════════════
    #  FRAME PREPROCESSING
    # ════════════════════════════════════════════════════════
    def _preprocess(self, frame: np.ndarray) -> torch.Tensor | None:
        """
        BGR frame → (1, 3, 224, 224) normalised tensor.
        Applies CLAHE contrast enhancement for:
          • dark CCTV feeds
          • phone/laptop screens → auto-sharpening + CLAHE
        """
        try:
            h, w = frame.shape[:2]
            # Centre-square crop
            s = min(h, w)
            y0, x0 = (h - s) // 2, (w - s) // 2
            crop = frame[y0:y0+s, x0:x0+s]

            # Screen-recording correction
            if self._is_screen(crop):
                crop = self._fix_screen(crop)

            # CLAHE on L-channel
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            l = clahe.apply(l)
            crop = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            tensor = _TRANSFORM(rgb).unsqueeze(0).to(DEVICE)
            return tensor
        except Exception as e:
            print(f"preprocess error: {e}")
            return None

    @staticmethod
    def _is_screen(frame: np.ndarray) -> bool:
        """Detect if frame is a screen recording (dark borders heuristic)."""
        bw = 12
        h, w = frame.shape[:2]
        edges = [frame[:bw,:], frame[-bw:,:], frame[:,:bw], frame[:,-bw:]]
        return float(np.mean([np.mean(e) for e in edges])) < 28

    @staticmethod
    def _fix_screen(frame: np.ndarray) -> np.ndarray:
        """Sharpen + denoise screen-recorded frames."""
        k = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]], np.float32)
        frame = cv2.filter2D(frame, -1, k)
        return cv2.bilateralFilter(frame, 5, 75, 75)

    # ════════════════════════════════════════════════════════
    #  CORE PREDICTION
    # ════════════════════════════════════════════════════════
    def predict_frame(self, frame: np.ndarray,
                      session_id: str = "default") -> dict | None:
        state = self._get_session(session_id)

        # ── Demo mode ──────────────────────────────────────
        if self.demo_class:
            conf = 0.91 + np.random.random() * 0.08
            state["window"].append(self.demo_class)
            return {
                "class": self.demo_class,
                "confidence": round(conf, 4),
                "risk": self._calc_risk(state),
                "reason": "⚠️ Demo mode active",
                "motion": 0.0, "persons": 1,
                "threshold": 0.99,
                "boxes": [], "debug_probs": {},
            }

        # ── Optical flow (motion) ──────────────────────────
        gray_small = cv2.cvtColor(
            cv2.resize(frame, (160, 160)), cv2.COLOR_BGR2GRAY)
        motion_score = self._optical_flow(state["prev_gray"], gray_small)
        state["prev_gray"] = gray_small

        # ── MobileNetV2 CNN ────────────────────────────────
        tensor = self._preprocess(frame)
        fight_p = assault_p = normal_p = 0.333

        if tensor is not None and self.classifier is not None:
            with torch.no_grad():
                logits = self.classifier(tensor)[0]
                probs  = torch.softmax(logits, dim=0).cpu().numpy()
            fight_p  = float(probs[0])
            assault_p = float(probs[1])
            normal_p = float(probs[2])

        combined_violence = fight_p + assault_p

        # ── YOLOv8 spatial analysis ────────────────────────
        num_persons       = 0
        current_boxes     = []
        proximity_warning = False
        high_velocity     = False
        overlap_detected  = False

        if self.person_model:
            results = self.person_model(frame, classes=[0], verbose=False)
            raw_boxes = results[0].boxes
            for box in raw_boxes:
                current_boxes.append(box.xyxy[0].cpu().numpy())
            num_persons = len(current_boxes)

            if num_persons >= 2:
                for i in range(num_persons):
                    for j in range(i+1, num_persons):
                        b1, b2 = current_boxes[i], current_boxes[j]

                        # Centre-distance (normalised by height)
                        c1 = np.array([(b1[0]+b1[2])/2, (b1[1]+b1[3])/2])
                        c2 = np.array([(b2[0]+b2[2])/2, (b2[1]+b2[3])/2])
                        dist = float(np.linalg.norm(c1-c2))
                        avg_h = ((b1[3]-b1[1])+(b2[3]-b2[1])) / 2
                        if avg_h > 0 and dist/avg_h < 1.0:
                            proximity_warning = True

                        # Bounding box overlap
                        ix1 = max(b1[0], b2[0]); iy1 = max(b1[1], b2[1])
                        ix2 = min(b1[2], b2[2]); iy2 = min(b1[3], b2[3])
                        if ix2 > ix1 and iy2 > iy1:
                            overlap_detected = True

            # Velocity tracking
            if state["prev_boxes"] and current_boxes:
                max_disp = 0.0
                for cb in current_boxes:
                    cc = np.array([(cb[0]+cb[2])/2, (cb[1]+cb[3])/2])
                    for pb in state["prev_boxes"]:
                        pc = np.array([(pb[0]+pb[2])/2, (pb[1]+pb[3])/2])
                        max_disp = max(max_disp, float(np.linalg.norm(cc-pc)))
                if max_disp > 35:
                    high_velocity = True

            state["prev_boxes"] = current_boxes

        # ── Scene classification rules ─────────────────────
        is_dynamic = motion_score > 2.0 or high_velocity
        reason = "Normal activity"
        is_violent_candidate = False

        if num_persons == 0:
            reason = "Empty scene — no persons detected"

        elif num_persons == 1:
            if is_dynamic and combined_violence > 0.90:
                is_violent_candidate = True
                reason = "⚠️ High-energy solo activity (very high CNN confidence)"
            else:
                reason = "Normal single-person scene"

        elif num_persons >= 2:
            if overlap_detected:
                reason = "⚠️ Physical contact detected"
                if combined_violence > 0.30 or is_dynamic:
                    is_violent_candidate = True

            elif proximity_warning and is_dynamic:
                if combined_violence > 0.35:
                    is_violent_candidate = True
                    reason = "⚠️ Aggressive close-range interaction"
                else:
                    reason = "Close proximity — appears non-aggressive"

            elif proximity_warning and combined_violence > 0.65:
                is_violent_candidate = True
                reason = "⚠️ Close proximity + CNN violence signal"

            elif is_dynamic and combined_violence > 0.75:
                is_violent_candidate = True
                reason = "⚠️ High-speed multi-person scene"

            elif is_dynamic:
                reason = f"Active movement — {num_persons} persons"

            else:
                reason = "Normal multi-person scene"

        # ── Temporal scoring ───────────────────────────────
        if is_violent_candidate:
            boost = 0.35 if (overlap_detected or (proximity_warning and is_dynamic)) else 0.22
            state["temp_score"] = min(1.0, state["temp_score"] + boost)
        else:
            state["temp_score"] = max(0.0, state["temp_score"] - 0.12)

        # ── Final decision ────────────────────────────────
        CONFIRM_THRESHOLD = 0.65
        predicted_class = "Normal"
        confidence      = normal_p

        if state["temp_score"] >= CONFIRM_THRESHOLD:
            if combined_violence > normal_p + 0.08:
                if fight_p >= assault_p:
                    predicted_class = "Fighting"
                    confidence      = fight_p
                else:
                    predicted_class = "Assault"
                    confidence      = assault_p
            # Even if CNN is uncertain, trust spatial rules for direct violence signals
            elif overlap_detected and is_dynamic and num_persons >= 2:
                predicted_class = "Fighting"
                confidence      = max(combined_violence, 0.55)
                reason          = "⚠️ Physical contact + motion detected"

        state["window"].append(predicted_class)
        risk = self._calc_risk(state)

        return {
            "class":      predicted_class,
            "confidence": round(float(confidence), 4),
            "risk":       risk,
            "reason":     reason,
            "motion":     round(float(motion_score), 3),
            "persons":    num_persons,
            "threshold":  round(float(state["temp_score"]), 3),
            "boxes":      [box.tolist() for box in current_boxes],
            "debug_probs": {
                "fighting": round(float(fight_p), 4),
                "assault":  round(float(assault_p), 4),
                "normal":   round(float(normal_p), 4),
            },
        }

    # ── Risk calculation ──────────────────────────────────────
    def _calc_risk(self, state: dict) -> str:
        window = state["window"]
        if not window:
            return "Low"
        violent = sum(1 for p in window if p in ("Fighting", "Assault"))
        if violent >= 5:  return "High"
        if violent >= 1:  return "Medium"
        return "Low"

    def calculate_risk(self, session_id: str = "default") -> str:
        return self._calc_risk(self._get_session(session_id))

    # ── Optical Flow ──────────────────────────────────────────
    @staticmethod
    def _optical_flow(prev_gray, curr_gray) -> float:
        if prev_gray is None:
            return 0.0
        try:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, curr_gray, None,
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0)
            mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            return float(np.mean(mag))
        except Exception:
            return 0.0

    # ════════════════════════════════════════════════════════
    #  VIDEO ANALYSIS  (isolated per-video session)
    # ════════════════════════════════════════════════════════
    def predict_video_detailed(self, video_path: str) -> dict:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        vid_sid = f"__video_{os.path.basename(video_path)}_{int(time.time())}"
        self.sessions.pop(vid_sid, None)

        frame_idx     = 0
        events        = []
        current_event = None
        skip          = max(1, int(fps / 2))

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % skip == 0:
                res = self.predict_frame(frame, session_id=vid_sid)
                if res:
                    res["timestamp"] = round(frame_idx / fps, 2)
                    is_violent = res["class"] != "Normal"
                    if is_violent:
                        if current_event is None:
                            current_event = {
                                "start_time":     res["timestamp"],
                                "start_frame":    frame_idx,
                                "type":           res["class"],
                                "max_confidence": res["confidence"],
                                "avg_confidence": res["confidence"],
                                "count":          1,
                                "humans_present": res["persons"] > 0,
                                "reason":         res["reason"],
                            }
                        else:
                            n = current_event["count"]
                            current_event["avg_confidence"] = (
                                current_event["avg_confidence"]*n + res["confidence"]
                            ) / (n+1)
                            current_event["max_confidence"] = max(
                                current_event["max_confidence"], res["confidence"])
                            current_event["end_time"]  = res["timestamp"]
                            current_event["end_frame"] = frame_idx
                            current_event["count"]    += 1
                    else:
                        if current_event and current_event["count"] >= 2:
                            events.append(current_event)
                        current_event = None
            frame_idx += 1

        if current_event and current_event["count"] >= 2:
            events.append(current_event)
        cap.release()
        self.sessions.pop(vid_sid, None)

        filtered  = [e for e in events if e["count"] >= 2]
        high_risk = any(e["avg_confidence"] > 0.40 or e["count"] > 5
                        for e in filtered)
        return {
            "summary": {
                "risk_level":     "High" if high_risk else ("Medium" if filtered else "Low"),
                "total_duration": round(total_frames / fps, 2),
                "event_count":    len(filtered),
            },
            "events": filtered,
        }

    def predict_youtube(self, youtube_url: str) -> dict:
        import yt_dlp, tempfile, shutil
        tmp = tempfile.mkdtemp()
        out = os.path.join(tmp, "yt.%(ext)s")
        try:
            with yt_dlp.YoutubeDL({
                "format":"best[height<=360]/worst",
                "outtmpl":out, "quiet":True, "no_warnings":True
            }) as ydl:
                ydl.download([youtube_url])
            files = [os.path.join(tmp, f) for f in os.listdir(tmp)]
            if not files:
                return {"error": "Download produced no files"}
            result = self.predict_video_detailed(files[0])
            shutil.rmtree(tmp, ignore_errors=True)
            return result
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            return {"error": str(e)}

    def predict_video(self, video_path: str):
        """Legacy compatibility."""
        res = self.predict_video_detailed(video_path)
        return (res["summary"]["risk_level"],
                res["events"][0]["type"] if res["events"] else "Normal")


# ── Singleton ─────────────────────────────────────────────────
predictor = Predictor()
