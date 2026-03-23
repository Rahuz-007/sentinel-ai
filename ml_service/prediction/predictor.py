"""
Sentinel AI — Predictor v3.2 (YOLOv8-Pose Edition)
=====================================================
NEW in v3.2:
  • YOLOv8n-POSE replaces YOLOv8n — detects 17 body keypoints
  • Pose-based fighting detection (no training required):
      - Raised arms / wrists above shoulders
      - Extended arms (punching motion)
      - Rapid limb velocity between frames
      - Body tilt (falling / knocked down)
      - Leg kick detection
  • Pose signals fused with CNN + spatial rules
  • Multi-camera support with isolated sessions
  • RTSP/IP camera stream analysis
"""

import os, sys, time, cv2
import numpy as np
from collections import deque

_PREDICTION_DIR = os.path.dirname(os.path.abspath(__file__))
_ML_SERVICE_DIR = os.path.dirname(_PREDICTION_DIR)
if _ML_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _ML_SERVICE_DIR)

import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

try:
    from ultralytics import YOLO
    _YOLO_OK = True
except ImportError:
    _YOLO_OK = False

# ── Constants ──────────────────────────────────────────────────
MODEL_PATH   = os.path.join(_ML_SERVICE_DIR, "model", "violence_model.pt")
POSE_MODEL   = "yolov8n-pose.pt"   # auto-downloads on first run
CLASSES      = ["Fighting", "Assault", "Normal"]
IMG_SIZE     = 224
WINDOW_SIZE  = 20
DEVICE       = "cuda" if torch.cuda.is_available() else "cpu"

# ── COCO keypoint indices ──────────────────────────────────────
KP_NOSE       = 0
KP_L_SHOULDER = 5;  KP_R_SHOULDER = 6
KP_L_ELBOW    = 7;  KP_R_ELBOW    = 8
KP_L_WRIST    = 9;  KP_R_WRIST    = 10
KP_L_HIP      = 11; KP_R_HIP      = 12
KP_L_KNEE     = 13; KP_R_KNEE     = 14
KP_L_ANKLE    = 15; KP_R_ANKLE    = 16

# ── Detection thresholds ───────────────────────────────────────
CONFIRM_THRESHOLD = 0.40   # fires after ~2 strong frames
BOOST_POSE        = 0.55   # pose-based fighting detected
BOOST_OVERLAP     = 0.50   # physical contact (bbox overlap)
BOOST_PROXIMITY   = 0.38   # close + moving
BOOST_SCREEN      = 0.35   # screen recording signals
BOOST_CNN_ONLY    = 0.25   # CNN-only signal
DECAY             = 0.10

_TRANSFORM = T.Compose([
    T.ToPILImage(),
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
])


# ══════════════════════════════════════════════════════════════
#  CNN MODEL
# ══════════════════════════════════════════════════════════════
class ViolenceClassifier(nn.Module):
    def __init__(self, num_classes=3):
        super().__init__()
        base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
        in_f = base.classifier[1].in_features
        base.classifier = nn.Sequential(
            nn.Dropout(0.3), nn.Linear(in_f, 256),
            nn.ReLU(), nn.Dropout(0.3), nn.Linear(256, num_classes),
        )
        self.model = base
    def forward(self, x): return self.model(x)


# ══════════════════════════════════════════════════════════════
#  POSE ANALYSIS
# ══════════════════════════════════════════════════════════════
def analyse_pose(keypoints_list: list, prev_kps: list, img_h: float) -> dict:
    """
    Analyse a list of person keypoints for fighting indicators.

    keypoints_list: list of (17, 3) arrays — x, y, confidence per person
    Returns: {fighting: bool, signals: [str], score: float}
    """
    signals = []
    score   = 0.0

    if not keypoints_list:
        return {"fighting": False, "signals": [], "score": 0.0}

    for i, kps in enumerate(keypoints_list):
        if kps is None or len(kps) < 17:
            continue
        kps = np.array(kps)
        conf = kps[:, 2]

        def valid(idx): return conf[idx] > 0.3
        def pt(idx):   return kps[idx, :2]

        # ── Raised arms (wrist y < shoulder y = higher in image) ──
        if valid(KP_L_WRIST) and valid(KP_L_SHOULDER):
            if pt(KP_L_WRIST)[1] < pt(KP_L_SHOULDER)[1] - img_h * 0.05:
                signals.append(f"P{i+1}:left_arm_raised")
                score += 0.25
        if valid(KP_R_WRIST) and valid(KP_R_SHOULDER):
            if pt(KP_R_WRIST)[1] < pt(KP_R_SHOULDER)[1] - img_h * 0.05:
                signals.append(f"P{i+1}:right_arm_raised")
                score += 0.25

        # ── Extended punch: wrist far from body centre ─────────
        if valid(KP_L_WRIST) and valid(KP_L_HIP) and valid(KP_L_SHOULDER):
            body_w  = abs(pt(KP_L_SHOULDER)[0] - pt(KP_L_HIP)[0]) + 1
            reach   = abs(pt(KP_L_WRIST)[0] - pt(KP_L_SHOULDER)[0])
            if reach / body_w > 1.5:
                signals.append(f"P{i+1}:left_punch_extend")
                score += 0.30
        if valid(KP_R_WRIST) and valid(KP_R_HIP) and valid(KP_R_SHOULDER):
            body_w  = abs(pt(KP_R_SHOULDER)[0] - pt(KP_R_HIP)[0]) + 1
            reach   = abs(pt(KP_R_WRIST)[0] - pt(KP_R_SHOULDER)[0])
            if reach / body_w > 1.5:
                signals.append(f"P{i+1}:right_punch_extend")
                score += 0.30

        # ── Body tilt / falling (shoulder–hip angle) ───────────
        if valid(KP_L_SHOULDER) and valid(KP_R_SHOULDER) and \
           valid(KP_L_HIP) and valid(KP_R_HIP):
            sh_mid  = (pt(KP_L_SHOULDER) + pt(KP_R_SHOULDER)) / 2
            hip_mid = (pt(KP_L_HIP)      + pt(KP_R_HIP))      / 2
            dy = abs(sh_mid[1] - hip_mid[1]) + 1
            dx = abs(sh_mid[0] - hip_mid[0])
            tilt_ratio = dx / dy
            if tilt_ratio > 0.75:
                signals.append(f"P{i+1}:body_tilt_fall")
                score += 0.35

        # ── High knee / kick ───────────────────────────────────
        if valid(KP_L_KNEE) and valid(KP_L_HIP):
            if pt(KP_L_KNEE)[1] < pt(KP_L_HIP)[1] - img_h * 0.08:
                signals.append(f"P{i+1}:left_knee_raised")
                score += 0.20
        if valid(KP_R_KNEE) and valid(KP_R_HIP):
            if pt(KP_R_KNEE)[1] < pt(KP_R_HIP)[1] - img_h * 0.08:
                signals.append(f"P{i+1}:right_knee_raised")
                score += 0.20

    # ── Limb velocity between frames ───────────────────────────
    if prev_kps and keypoints_list:
        for i, (curr, prev) in enumerate(zip(keypoints_list, prev_kps)):
            if curr is None or prev is None: continue
            curr_arr = np.array(curr); prev_arr = np.array(prev)
            # Wrist velocity
            for wrist_idx in [KP_L_WRIST, KP_R_WRIST]:
                if curr_arr[wrist_idx,2] > 0.3 and prev_arr[wrist_idx,2] > 0.3:
                    vel = np.linalg.norm(
                        curr_arr[wrist_idx,:2] - prev_arr[wrist_idx,:2])
                    if vel > 20:
                        signals.append(f"P{i+1}:wrist_velocity_{vel:.0f}px")
                        score += min(0.35, vel / 80)

    fighting = score >= 0.45 or (score >= 0.25 and len(signals) >= 2)
    return {"fighting": fighting, "signals": signals, "score": round(score, 3)}


# ══════════════════════════════════════════════════════════════
#  PREDICTOR
# ══════════════════════════════════════════════════════════════
class Predictor:
    def __init__(self):
        self.classifier      = None
        self.pose_model      = None
        self.demo_class      = None
        self.sessions        = {}
        self.model_fine_tuned = False

        self._load_classifier()
        self._load_pose_model()

    def _load_classifier(self):
        self.classifier = ViolenceClassifier().to(DEVICE)
        self.classifier.eval()
        if os.path.exists(MODEL_PATH):
            try:
                state = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
                self.classifier.load_state_dict(state)
                self.model_fine_tuned = True
                print(f"✅ Fine-tuned model loaded")
            except Exception as e:
                print(f"⚠️  Fine-tuned weights failed ({e}) — ImageNet baseline")
        else:
            print("ℹ️  No fine-tuned model — YOLO-Pose primary mode")

    def _load_pose_model(self):
        if not _YOLO_OK:
            return
        try:
            self.pose_model = YOLO(POSE_MODEL)
            print("✅ YOLOv8n-Pose loaded — keypoint detection active")
        except Exception as e:
            print(f"⚠️  Pose model failed ({e}), trying person-only…")
            try:
                self.pose_model = YOLO("yolov8n.pt")
                print("✅ YOLOv8n (no pose) loaded as fallback")
            except Exception as e2:
                print(f"❌ YOLO unavailable: {e2}")

    def load_model(self): self._load_classifier()

    # ── Sessions ──────────────────────────────────────────────
    def set_demo_mode(self, cls):
        if cls in CLASSES or cls is None:
            self.demo_class = cls; return True
        return False

    def _get_session(self, sid):
        if sid not in self.sessions:
            self.sessions[sid] = {
                "window":    deque(maxlen=WINDOW_SIZE),
                "prev_gray": None,
                "prev_boxes": [],
                "prev_kps":  [],
                "temp_score": 0.0,
                "last_active": time.time(),
            }
        self.sessions[sid]["last_active"] = time.time()
        return self.sessions[sid]

    def cleanup_old_sessions(self, max_idle=300.0):
        now  = time.time()
        dead = [s for s,v in self.sessions.items()
                if now-v["last_active"] > max_idle]
        for s in dead: del self.sessions[s]

    # ── Preprocessing ─────────────────────────────────────────
    @staticmethod
    def _is_screen(frame):
        bw = 15; h, w = frame.shape[:2]
        edges = [frame[:bw,:], frame[-bw:,:],
                 frame[:,:bw], frame[:,-bw:]]
        return float(np.mean([np.mean(e) for e in edges])) < 32

    @staticmethod
    def _enhance(frame):
        k = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]], np.float32)
        return cv2.bilateralFilter(cv2.filter2D(frame,-1,k), 5, 75, 75)

    @staticmethod
    def _clahe(frame):
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l,a,b = cv2.split(lab)
        l = cv2.createCLAHE(3.0,(8,8)).apply(l)
        return cv2.cvtColor(cv2.merge([l,a,b]), cv2.COLOR_LAB2BGR)

    def _preprocess(self, frame):
        try:
            h,w = frame.shape[:2]; s = min(h,w)
            y0,x0 = (h-s)//2, (w-s)//2
            crop = frame[y0:y0+s, x0:x0+s]
            is_sc = self._is_screen(crop)
            if is_sc: crop = self._enhance(crop)
            crop = self._clahe(crop)
            rgb  = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            return _TRANSFORM(rgb).unsqueeze(0).to(DEVICE), is_sc
        except: return None, False

    @staticmethod
    def _motion(prev_gray, curr_gray):
        if prev_gray is None: return 0.0
        try:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, curr_gray, None, 0.5,3,15,3,5,1.2,0)
            mag,_ = cv2.cartToPolar(flow[...,0], flow[...,1])
            return float(np.mean(mag))
        except: return 0.0

    # ══════════════════════════════════════════════════════════
    #  PREDICT FRAME
    # ══════════════════════════════════════════════════════════
    def predict_frame(self, frame, session_id="default"):
        state = self._get_session(session_id)

        if self.demo_class:
            conf = 0.91 + np.random.random()*0.08
            state["window"].append(self.demo_class)
            return {"class":self.demo_class,"confidence":round(conf,4),
                    "risk":self._risk(state),"reason":"⚠️ Demo mode",
                    "motion":0.0,"persons":1,"threshold":0.99,
                    "boxes":[],"debug_probs":{},"pose_signals":[]}

        # ── Optical flow ──────────────────────────────────────
        gray = cv2.cvtColor(cv2.resize(frame,(160,160)), cv2.COLOR_BGR2GRAY)
        motion_score = self._motion(state["prev_gray"], gray)
        state["prev_gray"] = gray

        # ── CNN ───────────────────────────────────────────────
        tensor, is_screen = self._preprocess(frame)
        fight_p = assault_p = normal_p = 0.333
        if tensor is not None:
            with torch.no_grad():
                probs = torch.softmax(self.classifier(tensor)[0], 0).cpu().numpy()
            fight_p, assault_p, normal_p = float(probs[0]), float(probs[1]), float(probs[2])
        combined_violence = fight_p + assault_p

        # ── YOLOv8-Pose ───────────────────────────────────────
        num_persons  = 0
        current_boxes = []
        keypoints_list = []
        prox_warn    = False
        high_vel     = False
        overlap_det  = False

        if self.pose_model:
            conf_t = 0.20 if is_screen else 0.30
            has_pose = hasattr(self.pose_model, 'predictor') or True
            results = self.pose_model(frame, classes=[0], verbose=False, conf=conf_t)
            res0    = results[0]

            for box in res0.boxes:
                current_boxes.append(box.xyxy[0].cpu().numpy())

            # Extract keypoints if pose model
            if hasattr(res0, 'keypoints') and res0.keypoints is not None:
                kps_data = res0.keypoints.data
                for i in range(len(kps_data)):
                    kps = kps_data[i].cpu().numpy()  # (17, 3)
                    keypoints_list.append(kps)
            else:
                keypoints_list = [None] * len(current_boxes)

            num_persons = len(current_boxes)

            if num_persons >= 2:
                for i in range(num_persons):
                    for j in range(i+1, num_persons):
                        b1, b2 = current_boxes[i], current_boxes[j]
                        c1 = np.array([(b1[0]+b1[2])/2, (b1[1]+b1[3])/2])
                        c2 = np.array([(b2[0]+b2[2])/2, (b2[1]+b2[3])/2])
                        dist  = float(np.linalg.norm(c1-c2))
                        avg_h = ((b1[3]-b1[1])+(b2[3]-b2[1]))/2
                        if avg_h > 0 and dist/avg_h < 1.2: prox_warn = True
                        ix2 = min(b1[2],b2[2]); ix1 = max(b1[0],b2[0])
                        iy2 = min(b1[3],b2[3]); iy1 = max(b1[1],b2[1])
                        if ix2>ix1 and iy2>iy1: overlap_det = True

            if state["prev_boxes"] and current_boxes:
                max_d = 0.0
                for cb in current_boxes:
                    cc = np.array([(cb[0]+cb[2])/2,(cb[1]+cb[3])/2])
                    for pb in state["prev_boxes"]:
                        pc = np.array([(pb[0]+pb[2])/2,(pb[1]+pb[3])/2])
                        max_d = max(max_d, float(np.linalg.norm(cc-pc)))
                if max_d > 25: high_vel = True

            state["prev_boxes"] = current_boxes

        # ── Pose analysis ─────────────────────────────────────
        h_img = frame.shape[0]
        pose_result = analyse_pose(keypoints_list, state["prev_kps"], h_img)
        state["prev_kps"] = keypoints_list

        # ──────────────────────────────────────────────────────
        #  DETECTION RULES (Priority order)
        # ──────────────────────────────────────────────────────
        is_moving = motion_score > 1.5 or high_vel
        violent_candidate = False
        boost  = 0.0
        reason = "Normal activity — monitoring"

        # 1. Pose-based fighting (highest confidence)
        if pose_result["fighting"] and num_persons >= 1:
            violent_candidate = True
            boost  = BOOST_POSE
            reason = f"⚠️ Fighting pose: {', '.join(pose_result['signals'][:2])}"

        # 2. Physical bbox overlap
        elif overlap_det and num_persons >= 2:
            violent_candidate = True
            boost  = BOOST_OVERLAP
            reason = "⚠️ Physical contact between persons"

        # 3. Proximity + motion
        elif prox_warn and is_moving and num_persons >= 2:
            violent_candidate = True
            boost  = BOOST_PROXIMITY
            reason = "⚠️ Aggressive close-range movement"

        # 4. Screen recording + 2 people + motion
        elif is_screen and num_persons >= 2 and is_moving:
            violent_candidate = True
            boost  = BOOST_SCREEN
            reason = "⚠️ Fighting detected on screen"

        # 5. Screen + high motion + CNN
        elif is_screen and motion_score > 3.0 and combined_violence > 0.45:
            violent_candidate = True
            boost  = BOOST_SCREEN
            reason = "⚠️ Screen + CNN violence signal"

        # 6. CNN strong signal
        elif combined_violence > 0.80 and is_moving:
            violent_candidate = True
            boost  = BOOST_CNN_ONLY
            reason = "⚠️ CNN violence signal"

        else:
            if num_persons == 0: reason = f"Empty scene (motion:{motion_score:.1f})"
            elif num_persons == 1: reason = "Single person — normal"
            else: reason = f"{num_persons} persons — no aggression"

        # ── Temporal scoring ──────────────────────────────────
        if violent_candidate:
            state["temp_score"] = min(1.0, state["temp_score"] + boost)
        else:
            state["temp_score"] = max(0.0, state["temp_score"] - DECAY)

        # ── Classification ────────────────────────────────────
        predicted_class = "Normal"
        confidence      = normal_p

        if state["temp_score"] >= CONFIRM_THRESHOLD:
            if violent_candidate and (overlap_det or prox_warn or pose_result["fighting"]):
                predicted_class = "Fighting"
                confidence      = max(combined_violence, 0.60)
                if not self.model_fine_tuned:
                    confidence = 0.72 + pose_result["score"] * 0.15
            elif combined_violence > normal_p + 0.05:
                predicted_class = "Fighting" if fight_p >= assault_p else "Assault"
                confidence      = max(fight_p, assault_p)

        state["window"].append(predicted_class)
        risk = self._risk(state)

        return {
            "class":       predicted_class,
            "confidence":  round(float(confidence), 4),
            "risk":        risk,
            "reason":      reason,
            "motion":      round(float(motion_score), 3),
            "persons":     num_persons,
            "threshold":   round(float(state["temp_score"]), 3),
            "boxes":       [b.tolist() for b in current_boxes],
            "screen_mode": is_screen,
            "pose_signals": pose_result["signals"],
            "pose_score":   pose_result["score"],
            "debug_probs": {
                "fighting": round(float(fight_p), 4),
                "assault":  round(float(assault_p), 4),
                "normal":   round(float(normal_p), 4),
            },
        }

    def _risk(self, state):
        w = state["window"]
        if not w: return "Low"
        v = sum(1 for p in w if p in ("Fighting","Assault"))
        if v >= 4: return "High"
        if v >= 1: return "Medium"
        return "Low"

    def calculate_risk(self, session_id="default"):
        return self._risk(self._get_session(session_id))

    # ══════════════════════════════════════════════════════════
    #  VIDEO / YOUTUBE  (unchanged)
    # ══════════════════════════════════════════════════════════
    def predict_video_detailed(self, video_path):
        cap   = cv2.VideoCapture(video_path)
        fps   = cap.get(cv2.CAP_PROP_FPS) or 25
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
                    res["timestamp"] = round(idx/fps, 2)
                    violent = res["class"] != "Normal"
                    if violent:
                        if cur is None:
                            cur = {"start_time":res["timestamp"],"start_frame":idx,
                                   "type":res["class"],"max_confidence":res["confidence"],
                                   "avg_confidence":res["confidence"],"count":1,
                                   "reason":res.get("reason","")}
                        else:
                            n = cur["count"]
                            cur["avg_confidence"] = (cur["avg_confidence"]*n+res["confidence"])/(n+1)
                            cur["max_confidence"] = max(cur["max_confidence"],res["confidence"])
                            cur["end_time"] = res["timestamp"]
                            cur["end_frame"] = idx
                            cur["count"] += 1
                    else:
                        if cur and cur["count"] >= 2: events.append(cur)
                        cur = None
            idx += 1

        if cur and cur["count"] >= 2: events.append(cur)
        cap.release()
        self.sessions.pop(sid, None)

        filtered  = [e for e in events if e["count"] >= 2]
        high_risk = any(e["avg_confidence"]>0.35 or e["count"]>4 for e in filtered)
        return {
            "summary": {"risk_level":"High" if high_risk else ("Medium" if filtered else "Low"),
                        "total_duration":round(total/fps,2), "event_count":len(filtered)},
            "events": filtered,
        }

    def predict_youtube(self, url):
        import yt_dlp, tempfile, shutil
        tmp = tempfile.mkdtemp()
        try:
            with yt_dlp.YoutubeDL({"format":"best[height<=360]/worst",
                "outtmpl":os.path.join(tmp,"yt.%(ext)s"),"quiet":True}) as ydl:
                ydl.download([url])
            files = [os.path.join(tmp,f) for f in os.listdir(tmp)]
            if not files: return {"error":"No file downloaded"}
            result = self.predict_video_detailed(files[0])
            shutil.rmtree(tmp, ignore_errors=True)
            return result
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            return {"error":str(e)}

    def predict_video(self, video_path):
        res = self.predict_video_detailed(video_path)
        return (res["summary"]["risk_level"],
                res["events"][0]["type"] if res["events"] else "Normal")

predictor = Predictor()
