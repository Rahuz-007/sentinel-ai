"""
Sentinel AI — Robust Image Preprocessor
=========================================
Handles real-world inputs including:
  - Direct CCTV feeds
  - Screen recordings (phone/laptop/TV played in front of camera)
  - Low-quality / dark / overexposed feeds
  - Various resolutions and aspect ratios
"""

import cv2
import numpy as np

IMG_SIZE = 112   # matches MobileNetV2 training resolution


# ─── Core Preprocessing ───────────────────────────────────────
def preprocess_frame(frame, enhance: bool = True):
    """
    Preprocess a single BGR frame for model inference.

    Steps
    -----
    1. Crop to square (centre-crop avoids edge artifacts)
    2. CLAHE lighting normalisation  →  handles dark CCTV, bright screens
    3. Resize to IMG_SIZE × IMG_SIZE
    4. Normalise to [0, 1]
    5. Add batch dimension  →  (1, 112, 112, 3)

    Parameters
    ----------
    frame   : BGR numpy array
    enhance : bool — apply CLAHE (set False during training datagen)

    Returns
    -------
    numpy array (1, IMG_SIZE, IMG_SIZE, 3) or None on error
    """
    try:
        if frame is None or frame.size == 0:
            return None

        h, w = frame.shape[:2]

        # ── Centre-crop to square ──────────────────────────────
        crop = min(h, w)
        y0 = (h - crop) // 2
        x0 = (w - crop) // 2
        frame = frame[y0:y0 + crop, x0:x0 + crop]

        # ── Lighting / contrast normalisation (CLAHE) ──────────
        if enhance:
            frame = apply_clahe(frame)

        # ── Resize ─────────────────────────────────────────────
        frame = cv2.resize(frame, (IMG_SIZE, IMG_SIZE),
                           interpolation=cv2.INTER_LINEAR)

        # ── RGB and normalise ──────────────────────────────────
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        return np.expand_dims(frame, axis=0)   # (1, H, W, 3)

    except Exception as e:
        print(f"⚠️  preprocess_frame error: {e}")
        return None


def apply_clahe(frame: np.ndarray) -> np.ndarray:
    """
    Adaptive histogram equalisation on the L-channel of LAB.
    Dramatically improves visibility in:
      - dark CCTV footage
      - videos played on screens (glare, colour cast)
    """
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    except Exception:
        return frame   # fall back to original if conversion fails


# ─── Screen Recording Detection & Correction ──────────────────
def detect_screen_border(frame: np.ndarray) -> bool:
    """
    Heuristic: if the image has very dark/uniform borders, a
    screen is probably being filmed.  Returns True if detected.
    """
    h, w = frame.shape[:2]
    border = 10  # pixel border to inspect
    edges = [
        frame[:border, :],
        frame[-border:, :],
        frame[:, :border],
        frame[:, -border:],
    ]
    mean_brightness = np.mean([np.mean(e) for e in edges])
    return mean_brightness < 25   # very dark borders = likely screen


def correct_screen_recording(frame: np.ndarray) -> np.ndarray:
    """
    Enhance frames that appear to be filmed off a screen:
    - Increase sharpness
    - Correct brightness
    - Reduce moiré effects via bilateral filter
    """
    # Sharpening kernel
    kernel = np.array([[0, -1, 0],
                        [-1, 5, -1],
                        [0, -1, 0]], dtype=np.float32)
    frame = cv2.filter2D(frame, -1, kernel)

    # Bilateral filter to reduce patterns without blurring edges
    frame = cv2.bilateralFilter(frame, 5, 75, 75)

    return frame


def preprocess_frame_adaptive(frame: np.ndarray):
    """
    Smart preprocessing that auto-detects screen recordings
    and applies correction before the standard pipeline.
    """
    try:
        if frame is None or frame.size == 0:
            return None

        if detect_screen_border(frame):
            frame = correct_screen_recording(frame)

        return preprocess_frame(frame, enhance=True)

    except Exception as e:
        print(f"⚠️  preprocess_frame_adaptive error: {e}")
        return None


# ─── Optical Flow Frame Differencing ──────────────────────────
def compute_motion_magnitude(prev_gray: np.ndarray,
                              curr_gray: np.ndarray) -> float:
    """
    Dense optical flow magnitude using Farnebäck algorithm.
    More accurate than simple frame differencing.
    Returns average magnitude (0 = static, high = lots of motion).
    """
    if prev_gray is None or curr_gray is None:
        return 0.0
    try:
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray,
            None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2,
            flags=0,
        )
        mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        return float(np.mean(mag))
    except Exception:
        return 0.0


# ─── Legacy / Utility ─────────────────────────────────────────
def load_and_preprocess_image(image_path: str):
    """Load an image file and preprocess it for inference."""
    frame = cv2.imread(image_path)
    if frame is None:
        return None
    return preprocess_frame(frame)


def preprocess_batch(frames: list) -> np.ndarray:
    """Preprocess a list of frames and stack into a single batch."""
    processed = [preprocess_frame(f) for f in frames]
    processed = [p[0] for p in processed if p is not None]
    if not processed:
        return np.zeros((0, IMG_SIZE, IMG_SIZE, 3), np.float32)
    return np.stack(processed)
