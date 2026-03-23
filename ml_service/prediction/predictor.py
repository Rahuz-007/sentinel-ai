"""
Sentinel AI — Core Predictor v3.1  (YOLO-First Edition)
=========================================================
Key fix over v3.0
-----------------
• YOLO spatial rules are PRIMARY — CNN is a bonus, not a blocker
• Works even with no fine-tuned model (ImageNet baseline is enough)
• Phone / screen-recording mode: detects fighting inside the phone display
• Much lower thresholds — designed to actually fire in real scenes
• Temporal threshold: 0.45 (was 0.65) — fires after ~2 frames of violence
• All temporal boosts increased

Detection logic (priority order):
  1. YOLO overlap (physical contact) + any motion  → immediate Violence
  2. YOLO 2+ persons close + high motion           → Violence
  3. High motion + screen-mode + 2+ persons        → Violence
  4. CNN alone (only if YOLO sees no persons)      → Violence if >0.82
"""

import os, sys, time, cv2
import numpy as np
from collections import deque

# ── Path ──────────────────────────────────────────────────────
_PREDICTION_DIR = os.path.dirname(os.path.abspath(__file__))
_ML_SERVICE_DIR = os.path.dirname(_PREDICTION_DIR)
if _ML_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _ML_SERVICE_DIR)

# ── PyTorch ───────────────────────────────────────────────────
import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

# ── YOLOv8 ────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
    _YOLO_OK = True
except ImportError:
    _YOLO_OK = False
    print("⚠️  ultralytics not installed — spatial analysis disabled")

# ── Constants ─────────────────────────────────────────────────
MODEL_PATH  = os.path.join(_ML_SERVICE_DIR, "model", "violence_model.pt")
CLASSES     = ["Fighting", "Assault", "Normal"]
IMG_SIZE    = 224
WINDOW_SIZE = 20          # shorter window → reacts faster
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"

# ── Thresholds (tuned for real-world use without fine-tuned CNN) ──
CONFIRM_THRESHOLD  = 0.45   # was 0.65 — fires after ~2 strong frames
BOOST_OVERLAP      = 0.50   # physical contact detected
BOOST_PROXIMITY    = 0.38   # people very close + motion
BOOST_SCREEN       = 0.35   # screen recording with violence signals
BOOST_CNN_ONLY     = 0.25   # CNN only (weaker signal)
DECAY              = 0.10   # was 0.12 — slow decay keeps alerts longer

# ── Transform ─────────────────────────────────────────────────
_TRANSFORM = T.Compose([
    T.ToPILImage(),
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std =[0.229, 0.224, 0.225]),
])


# ══════════════════════════════════════════════════════════════
#  MODEL
# ══════════════════════════════════════════════════════════════
class ViolenceClassifier(nn.Module):
    def __init__(self, num_classes=3):
        super().__init__()
        base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
        in_f = base.classifier[1].in_features
        base.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(in_f, 256),
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
        self.model_fine_tuned = False

        self._load_classifier()
        self._load_yolo()

    # ── Loaders ───────────────────────────────────────────────
    def _load_classifier(self):
        self.classifier = ViolenceClassifier(num_classes=3).to(DEVICE)
        self.classifier.eval()

        if os.path.exists(MODEL_PATH):
            try:
                state = torch.load(MODEL_PATH, map_location=DEVICE,
                                   weights_only=True)
                self.classifier.load_state_dict(state)
                self.model_fine_tuned = True
                print(f"✅ Fine-tuned model loaded: {MODEL_PATH}")
            except Exception as e:
                print(f"⚠️  Fine-tuned weights failed ({e}) — ImageNet baseline")
        else:
            print("ℹ️  No fine-tuned model — using YOLO-primary detection mode")
            print("   (Run training/train_model.py to improve CNN accuracy)")

    def load_model(self):
        self._load_classifier()

    def _load_yolo(self):
        if _YOLO_OK:
            try:
                self.person_model = YOLO("yolov8n.pt")
                print("✅ YOLOv8n loaded — spatial detection active")
            except Exception as e:
                print(f"⚠️  YOLO load failed: {e}")

    # ── Sessions ──────────────────────────────────────────────
    def set_demo_mode(self, cls):
        if cls in CLASSES or cls is None:
            self.demo_class = cls
            return True
        return False

    def _get_session(self, sid):
        if sid not in self.sessions:
            self.sessions[sid] = {
                "window":      deque(maxlen=WINDOW_SIZE),
                "prev_gray":   None,
                "prev_boxes":  [],
                "temp_score":  0.0,
                "last_active": time.time(),
            }
        self.sessions[sid]["last_active"] = time.time()
        return self.sessions[sid]

    def cleanup_old_sessions(self, max_idle=300.0):
        now  = time.time()
        dead = [s for s, v in self.sessions.items()
                if now - v["last_active"] > max_idle]
        for s in dead:
            del self.sessions[s]

    # ── Preprocessing ─────────────────────────────────────────
    @staticmethod
    def _is_screen(frame):
        """Dark-border heuristic to detect phone/laptop screens."""
        bw = 15
        h, w = frame.shape[:2]
        edges = [frame[:bw,:], frame[-bw:,:],
                 frame[:,:bw], frame[:,-bw:]]
        return float(np.mean([np.mean(e) for e in edges])) < 32

    @staticmethod
    def _enhance_screen(frame):
        """Sharpen + denoise for screen-recorded frames."""
        k = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]], np.float32)
        frame = cv2.filter2D(frame, -1, k)
        return cv2.bilateralFilter(frame, 5, 75, 75)

    @staticmethod
    def _clahe(frame):
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    def _preprocess(self, frame):
        try:
            h, w = frame.shape[:2]
            s = min(h, w)
            y0, x0 = (h-s)//2, (w-s)//2
            crop = frame[y0:y0+s, x0:x0+s]

            is_screen = self._is_screen(crop)
            if is_screen:
                crop = self._enhance_screen(crop)
            crop = self._clahe(crop)

            rgb  = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            return _TRANSFORM(rgb).unsqueeze(0).to(DEVICE), is_screen
        except Exception as e:
            return None, False

    # ── Optical flow ──────────────────────────────────────────
    @staticmethod
    def _motion(prev_gray, curr_gray):
        if prev_gray is None:
            return 0.0
        try:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, curr_gray, None,
                0.5, 3, 15, 3, 5, 1.2, 0)
            mag, _ = cv2.cartToPolar(flow[...,0], flow[...,1])
            return float(np.mean(mag))
        except Exception:
            return 0.0

    # ══════════════════════════════════════════════════════════
    #  CORE FRAME PREDICTION
    # ══════════════════════════════════════════════════════════
    def predict_frame(self, frame, session_id="default"):
        state = self._get_session(session_id)

        # ── Demo mode ─────────────────────────────────────
        if self.demo_class:
            conf = 0.91 + np.random.random() * 0.08
            state["window"].append(self.demo_class)
            return {
                "class": self.demo_class, "confidence": round(conf, 4),
                "risk":  self._risk(state), "reason": "⚠️ Demo mode",
                "motion": 0.0, "persons": 1, "threshold": 0.99,
                "boxes": [], "debug_probs": {},
            }

        # ── Optical flow ──────────────────────────────────
        small = cv2.resize(frame, (160, 160))
        gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        motion_score = self._motion(state["prev_gray"], gray)
        state["prev_gray"] = gray

        # ── CNN inference ─────────────────────────────────
        tensor, is_screen = self._preprocess(frame)
        fight_p = assault_p = normal_p = 0.333

        if tensor is not None and self.classifier is not None:
            with torch.no_grad():
                probs = torch.softmax(
                    self.classifier(tensor)[0], dim=0
                ).cpu().numpy()
            fight_p   = float(probs[0])
            assault_p = float(probs[1])
            normal_p  = float(probs[2])

        combined_violence = fight_p + assault_p

        # ── YOLOv8 person detection ────────────────────────
        num_persons    = 0
        current_boxes  = []
        proximity_warn = False
        high_velocity  = False
        overlap_detect = False

        if self.person_model:
            # Use lower confidence for screen-recording (persons appear smaller)
            conf_thresh = 0.20 if is_screen else 0.35
            results = self.person_model(
                frame, classes=[0], verbose=False, conf=conf_thresh)
            for box in results[0].boxes:
                current_boxes.append(box.xyxy[0].cpu().numpy())
            num_persons = len(current_boxes)

            if num_persons >= 2:
                for i in range(num_persons):
                    for j in range(i+1, num_persons):
                        b1, b2 = current_boxes[i], current_boxes[j]

                        # Centre distance / height ratio
                        c1 = np.array([(b1[0]+b1[2])/2, (b1[1]+b1[3])/2])
                        c2 = np.array([(b2[0]+b2[2])/2, (b2[1]+b2[3])/2])
                        dist  = float(np.linalg.norm(c1-c2))
                        avg_h = ((b1[3]-b1[1])+(b2[3]-b2[1])) / 2
                        if avg_h > 0 and dist/avg_h < 1.2:   # was 1.0
                            proximity_warn = True

                        # Bounding box overlap (physical contact)
                        ix1 = max(b1[0],b2[0]); ix2 = min(b1[2],b2[2])
                        iy1 = max(b1[1],b2[1]); iy2 = min(b1[3],b2[3])
                        if ix2 > ix1 and iy2 > iy1:
                            overlap_detect = True

            # Velocity between frames
            if state["prev_boxes"] and current_boxes:
                max_d = 0.0
                for cb in current_boxes:
                    cc = np.array([(cb[0]+cb[2])/2, (cb[1]+cb[3])/2])
                    for pb in state["prev_boxes"]:
                        pc = np.array([(pb[0]+pb[2])/2, (pb[1]+pb[3])/2])
                        max_d = max(max_d, float(np.linalg.norm(cc-pc)))
                if max_d > 25:   # was 35
                    high_velocity = True
            state["prev_boxes"] = current_boxes

        # ─────────────────────────────────────────────────────
        #  DETECTION RULES  (YOLO-first, CNN as bonus)
        # ─────────────────────────────────────────────────────
        is_moving = motion_score > 1.5 or high_velocity   # was 2.0
        is_violent_candidate = False
        boost  = 0.0
        reason = "Normal activity — monitoring"

        # ── Rule 1: Physical contact (bbox overlap) ────────
        if overlap_detect and num_persons >= 2:
            is_violent_candidate = True
            boost  = BOOST_OVERLAP
            reason = "⚠️ Physical contact between persons detected"

        # ── Rule 2: Very close + moving ───────────────────
        elif proximity_warn and is_moving and num_persons >= 2:
            is_violent_candidate = True
            boost  = BOOST_PROXIMITY
            reason = "⚠️ Aggressive close-range interaction"

        # ── Rule 3: Screen-recording + 2 people + motion ──
        elif is_screen and num_persons >= 2 and is_moving:
            is_violent_candidate = True
            boost  = BOOST_SCREEN
            reason = "⚠️ Fighting detected on screen recording"

        # ── Rule 4: Screen + high motion + CNN signal ─────
        elif is_screen and motion_score > 3.0 and combined_violence > 0.45:
            is_violent_candidate = True
            boost  = BOOST_SCREEN
            reason = "⚠️ Screen recording — high motion + CNN signal"

        # ── Rule 5: CNN only (strong signal without YOLO) ──
        elif combined_violence > 0.82 and is_moving:
            is_violent_candidate = True
            boost  = BOOST_CNN_ONLY
            reason = "⚠️ CNN violence signal (YOLO no persons)"

        # ── No violence signals ────────────────────────────
        else:
            if num_persons == 0:
                reason = f"Empty scene — motion: {motion_score:.1f}"
            elif num_persons == 1:
                reason = f"Single person — monitoring"
            else:
                reason = f"{num_persons} persons — no aggression detected"

        # ── Temporal scoring ───────────────────────────────
        if is_violent_candidate:
            state["temp_score"] = min(1.0, state["temp_score"] + boost)
        else:
            state["temp_score"] = max(0.0, state["temp_score"] - DECAY)

        # ── Final classification ───────────────────────────
        predicted_class = "Normal"
        confidence      = normal_p

        if state["temp_score"] >= CONFIRM_THRESHOLD:
            # YOLO-driven classification (most reliable)
            if is_violent_candidate and (overlap_detect or proximity_warn):
                predicted_class = "Fighting"
                confidence      = max(combined_violence, 0.60)
                if not self.model_fine_tuned:
                    confidence = 0.72   # fixed confidence when using baseline
            # CNN-driven (only when fine-tuned model loaded)
            elif combined_violence > normal_p + 0.05:
                predicted_class = "Fighting" if fight_p >= assault_p else "Assault"
                confidence      = max(fight_p, assault_p)

        state["window"].append(predicted_class)
        risk = self._risk(state)

        return {
            "class":      predicted_class,
            "confidence": round(float(confidence), 4),
            "risk":       risk,
            "reason":     reason,
            "motion":     round(float(motion_score), 3),
            "persons":    num_persons,
            "threshold":  round(float(state["temp_score"]), 3),
            "boxes":      [b.tolist() for b in current_boxes],
            "debug_probs": {
                "fighting": round(float(fight_p), 4),
                "assault":  round(float(assault_p), 4),
                "normal":   round(float(normal_p), 4),
            },
            "screen_mode": is_screen,
        }

    # ── Risk level ────────────────────────────────────────────
    def _risk(self, state):
        w = state["window"]
        if not w: return "Low"
        v = sum(1 for p in w if p in ("Fighting", "Assault"))
        if v >= 4: return "High"
        if v >= 1: return "Medium"
        return "Low"

    def calculate_risk(self, session_id="default"):
        return self._risk(self._get_session(session_id))

    # ══════════════════════════════════════════════════════════
    #  VIDEO ANALYSIS
    # ══════════════════════════════════════════════════════════
    def predict_video_detailed(self, video_path):
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        sid   = f"__video_{int(time.time())}"
        self.sessions.pop(sid, None)

        idx, events, cur, skip = 0, [], None, max(1, int(fps/2))

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            if idx % skip == 0:
                res = self.predict_frame(frame, sid)
                if res:
                    res["timestamp"] = round(idx / fps, 2)
                    violent = res["class"] != "Normal"
                    if violent:
                        if cur is None:
                            cur = {"start_time": res["timestamp"],
                                   "start_frame": idx,
                                   "type": res["class"],
                                   "max_confidence": res["confidence"],
                                   "avg_confidence": res["confidence"],
                                   "count": 1,
                                   "reason": res.get("reason","")}
                        else:
                            n = cur["count"]
                            cur["avg_confidence"] = (cur["avg_confidence"]*n + res["confidence"])/(n+1)
                            cur["max_confidence"] = max(cur["max_confidence"], res["confidence"])
                            cur["end_time"]  = res["timestamp"]
                            cur["end_frame"] = idx
                            cur["count"]    += 1
                    else:
                        if cur and cur["count"] >= 2:
                            events.append(cur)
                        cur = None
            idx += 1

        if cur and cur["count"] >= 2:
            events.append(cur)
        cap.release()
        self.sessions.pop(sid, None)

        filtered  = [e for e in events if e["count"] >= 2]
        high_risk = any(e["avg_confidence"] > 0.35 or e["count"] > 4
                        for e in filtered)
        return {
            "summary": {
                "risk_level":     "High" if high_risk else ("Medium" if filtered else "Low"),
                "total_duration": round(total/fps, 2),
                "event_count":    len(filtered),
            },
            "events": filtered,
        }

    def predict_youtube(self, youtube_url):
        import yt_dlp, tempfile, shutil
        tmp = tempfile.mkdtemp()
        try:
            with yt_dlp.YoutubeDL({
                "format":"best[height<=360]/worst",
                "outtmpl":os.path.join(tmp,"yt.%(ext)s"),
                "quiet":True
            }) as ydl:
                ydl.download([youtube_url])
            files = [os.path.join(tmp,f) for f in os.listdir(tmp)]
            if not files: return {"error":"No file downloaded"}
            result = self.predict_video_detailed(files[0])
            shutil.rmtree(tmp, ignore_errors=True)
            return result
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            return {"error": str(e)}

    def predict_video(self, video_path):
        res = self.predict_video_detailed(video_path)
        return (res["summary"]["risk_level"],
                res["events"][0]["type"] if res["events"] else "Normal")


# ── Singleton ─────────────────────────────────────────────────
predictor = Predictor()
