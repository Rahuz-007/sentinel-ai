"""
Sentinel AI — Dataset Downloader & Frame Extractor
====================================================
Downloads shreyj1729/cctv-fights-dataset from Kaggle,
reads ground-truth.json annotations, extracts labeled
frames, and organises them into:

  dataset/
    Fight/   ← frames from fight segments
    Normal/  ← frames from non-fight segments

Run:
    pip install kagglehub opencv-python tqdm
    python download_dataset.py
"""

import os, sys, json, random, shutil
import cv2
from tqdm import tqdm

# ── Output layout ─────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(ROOT, "dataset")

FIGHT_DIR  = os.path.join(OUTPUT_DIR, "Fight")
NORMAL_DIR = os.path.join(OUTPUT_DIR, "Normal")

FRAMES_PER_VIDEO  = 30      # total frames to sample per video
FIGHT_FRAME_RATIO = 0.60    # 60 % fight frames, 40 % normal frames
IMG_SIZE = 112               # match training resolution


def make_dirs():
    for d in [FIGHT_DIR, NORMAL_DIR]:
        os.makedirs(d, exist_ok=True)
    print(f"📁 Output: {OUTPUT_DIR}")


def download() -> str:
    """Download via kagglehub and return the local path."""
    try:
        import kagglehub
        print("⬇  Downloading shreyj1729/cctv-fights-dataset …")
        path = kagglehub.dataset_download("shreyj1729/cctv-fights-dataset")
        print(f"✅ Downloaded to: {path}")
        return path
    except ImportError:
        print("❌  kagglehub not installed. Run: pip install kagglehub")
        sys.exit(1)
    except Exception as e:
        print(f"❌  Download failed: {e}")
        print("   Make sure kaggle.json is in ~/.kaggle/ with your API key.")
        sys.exit(1)


def find_ground_truth(base_path: str) -> dict:
    """Locate ground-truth.json anywhere in the download tree."""
    for root, _, files in os.walk(base_path):
        for f in files:
            if f == "ground-truth.json":
                full = os.path.join(root, f)
                print(f"📄 Found ground-truth: {full}")
                with open(full) as fh:
                    return json.load(fh), root
    return {}, base_path


def find_videos(base_path: str):
    """Walk the download tree and collect all video files."""
    exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    videos = []
    for root, _, files in os.walk(base_path):
        for f in files:
            if os.path.splitext(f)[1].lower() in exts:
                videos.append(os.path.join(root, f))
    print(f"🎬 Found {len(videos)} video files.")
    return videos


def extract_frames_from_video(video_path: str, fight_segments: list,
                               label: str, counter: list) -> int:
    """
    Extract frames from a video.

    fight_segments: list of {start_frame, end_frame} dicts — may be empty.
    label: "Fight" | "Normal" (override; used for non-annotated videos).
    Returns number of frames saved.
    """
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    if total_frames < 1:
        cap.release()
        return 0

    fight_idxs  = set()
    normal_idxs = set()

    if fight_segments:
        for seg in fight_segments:
            s = seg.get("startFrame", seg.get("start_frame", 0))
            e = seg.get("endFrame",   seg.get("end_frame",   total_frames))
            fight_idxs.update(range(int(s), min(int(e) + 1, total_frames)))
        all_idxs = set(range(total_frames))
        normal_idxs = all_idxs - fight_idxs

        n_fight  = min(int(FRAMES_PER_VIDEO * FIGHT_FRAME_RATIO), len(fight_idxs))
        n_normal = min(FRAMES_PER_VIDEO - n_fight, len(normal_idxs))
        chosen_fight  = random.sample(sorted(fight_idxs),  n_fight)  if n_fight  else []
        chosen_normal = random.sample(sorted(normal_idxs), n_normal) if n_normal else []
        chosen = [(i, "Fight") for i in chosen_fight] + [(i, "Normal") for i in chosen_normal]
    else:
        # No annotation — use the override label for all sampled frames
        step = max(1, total_frames // FRAMES_PER_VIDEO)
        chosen = [(i * step, label) for i in range(FRAMES_PER_VIDEO)
                  if i * step < total_frames]

    chosen_dict = {idx: lbl for idx, lbl in chosen}
    saved = 0

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx in chosen_dict:
            lbl  = chosen_dict[frame_idx]
            dest = FIGHT_DIR if lbl == "Fight" else NORMAL_DIR
            name = f"{lbl}_{counter[0]:06d}.jpg"
            out  = os.path.join(dest, name)
            # Resize + basic quality enhancement for consistency
            frame = cv2.resize(frame, (IMG_SIZE, IMG_SIZE))
            frame = apply_quality_norm(frame)
            cv2.imwrite(out, frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            counter[0] += 1
            saved += 1
        frame_idx += 1
        if frame_idx > max(chosen_dict.keys(), default=0) + 1:
            break

    cap.release()
    return saved


def apply_quality_norm(frame):
    """
    Normalise lighting so frames extracted from different sources
    (CCTV, phone screens, YouTube playback) look consistent.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def build_annotation_map(gt: dict, base_path: str) -> dict:
    """
    Map video filename (stem) → list of fight segment dicts.
    Handles both common JSON structures seen in this dataset.
    """
    mapping = {}

    if isinstance(gt, dict):
        for key, val in gt.items():
            stem = os.path.splitext(os.path.basename(key))[0]
            if isinstance(val, list):
                mapping[stem] = val
            elif isinstance(val, dict):
                segs = val.get("segments") or val.get("fights") or []
                mapping[stem] = segs

    return mapping


def main():
    make_dirs()
    dl_path   = download()
    gt, gt_dir = find_ground_truth(dl_path)
    ann_map    = build_annotation_map(gt, gt_dir)
    videos     = find_videos(dl_path)

    if not videos:
        print("❌  No videos found. Check the download path.")
        sys.exit(1)

    counter = [0]  # mutable counter shared across calls
    total_fight = 0; total_normal = 0

    for vp in tqdm(videos, desc="Extracting frames"):
        stem = os.path.splitext(os.path.basename(vp))[0]
        segments = ann_map.get(stem, [])

        # Infer label from folder structure if no annotation
        path_lower = vp.lower()
        if "fight" in path_lower or "violence" in path_lower:
            default_label = "Fight"
        else:
            default_label = "Normal"

        n = extract_frames_from_video(vp, segments, default_label, counter)

    # Count results
    total_fight  = len(os.listdir(FIGHT_DIR))
    total_normal = len(os.listdir(NORMAL_DIR))

    print("\n" + "="*55)
    print(f"  ✅ Extraction complete")
    print(f"  Fight  frames : {total_fight:,}")
    print(f"  Normal frames : {total_normal:,}")
    print(f"  Total          : {total_fight + total_normal:,}")
    print(f"  Saved to       : {OUTPUT_DIR}")
    print("="*55)
    print("\n▶  Next step: python train_model.py")


if __name__ == "__main__":
    main()
