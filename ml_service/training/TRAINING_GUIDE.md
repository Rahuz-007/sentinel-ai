# Sentinel AI — Training Guide

This guide explains how to train the violence detection model using the CCTV Fights Dataset from Kaggle.

---

## 📋 Prerequisites

### 1. Kaggle API Key
Create a free account at [kaggle.com](https://kaggle.com), then:
- Go to **Account → API → Create New Token**
- Save the downloaded `kaggle.json` to `C:\Users\<YourName>\.kaggle\kaggle.json` (Windows)

### 2. Install Python Dependencies
```bash
cd ml_service
pip install -r requirements.txt
```

---

## 🚀 Step-by-Step Training

### Step 1: Download & Extract Dataset Frames
```bash
cd ml_service/training
python download_dataset.py
```

This will:
- Download `shreyj1729/cctv-fights-dataset` via kagglehub (~2–5 GB)
- Read `ground-truth.json` fight segment annotations
- Extract **30 frames per video** with CLAHE lighting normalisation
- Save to `ml_service/../dataset/Fight/` and `dataset/Normal/`

Expected output:
```
✅ Extraction complete
Fight  frames : ~15,000
Normal frames : ~10,000
Total          : ~25,000
```

### Step 2: Train the Model
```bash
cd ml_service/training
python train_model.py
```

This runs a **2-phase MobileNetV2 transfer learning** pipeline:

| Phase | Duration | What Happens |
|-------|----------|--------------|
| Phase 1 | ~5 min | Backbone frozen — only classification head trained |
| Phase 2 | ~15 min | Top 30 MobileNetV2 layers fine-tuned |

The best model (by validation accuracy) is auto-saved to:
```
ml_service/model/cnn_model.h5
```

The old model is backed up to `cnn_model_backup.h5`.

### Step 3: Restart the ML Service
```bash
cd ml_service
python app.py
```

The new model is loaded automatically on startup.

---

## ⚙️ Training Options

```bash
python train_model.py --help

  --phase1-epochs  INT   Phase 1 epochs (default: 10)
  --phase2-epochs  INT   Phase 2 epochs (default: 15)
  --lr             FLOAT Fine-tuning learning rate (default: 1e-4)
  --batch-size     INT   Batch size (default: 32)
```

---

## 🎯 Model Architecture

```
Input: (112, 112, 3)
  ↓
MobileNetV2 (ImageNet pretrained)
  ↓
GlobalAveragePooling2D
  ↓
Dense(256, relu) → Dropout(0.4)
  ↓
Dense(128, relu) → Dropout(0.3)
  ↓
Dense(3, softmax)   [Fighting | Assault | Normal]
```

**Why MobileNetV2?**
- Pretrained on 1.28M ImageNet images → strong visual features from day 1
- Lightweight (3.4M params vs 25M+ for VGG16)
- Runs at real-time speed on CPU (~150ms/frame)

---

## 🔧 Robustness to Screen Recordings

The pipeline is specifically designed to handle:

| Challenge | Solution |
|-----------|----------|
| Dark CCTV footage | CLAHE adaptive histogram equalisation |
| Phone/laptop screen in front of camera | Auto-detected + bilateral sharpening filter |
| YouTube video playback | Same corrections + `yt-dlp` 360p download |
| Colour cast from screens | `channel_shift_range=25` in training augmentation |
| Glare / overexposure | `brightness_range=[0.6, 1.4]` augmentation |
| Camera shake | Optical flow motion scoring (Farnebäck) |

---

## 📊 Expected Results

After training on the full CCTV Fights Dataset:

- **Validation accuracy**: ~85–92%
- **Real-time webcam FPS**: 5–8 fps (CPU) / 15–25 fps (GPU)
- **False positive rate**: <8% (temporal validation requires 3+ consecutive frames)

---

## 🔄 Continuous Improvement

The system collects real-world feedback through:
- **"False Alarm"** button → marks frames as Normal (future training negative)
- **"Verified"** button → confirms violence (future training positive)

To retrain with updated data, simply add frames to `dataset/Fight/` or `dataset/Normal/` and re-run `train_model.py`.
