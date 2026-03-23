# 🛡️ Sentinel AI — Behavioral Risk Analysis System v2.1

> **Production-grade, law-enforcement-ready AI surveillance platform**  
> Real-time violence detection · Smart alerts · Command-center dashboard

![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20Flask%20%7C%20PyTorch-blue)
![YOLO](https://img.shields.io/badge/Detection-YOLOv8%20%2B%20MobileNetV2-green)
![Python](https://img.shields.io/badge/Python-3.14%2B-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 🎯 What It Does

Sentinel AI monitors live webcam feeds and uploaded/YouTube videos to **automatically detect violent behavior** (fighting, assault), assess threat levels, and send real-time alerts — all accessible from a browser-based command-center dashboard.

---

## 🏗️ Architecture

```
👤 Browser (React)          → http://localhost:5173
      ↕  REST + Socket.IO
🟢 Node.js Backend          → http://localhost:4005
      ↕  HTTP proxy
🐍 Flask ML Service         → http://localhost:5000
      ↕  Inference
🧠 YOLOv8n + MobileNetV2    (Violence Detection)
```

---

## ✨ Key Features

| Feature | Details |
|---|---|
| **Live Webcam Detection** | Streams frames to YOLOv8 + CNN · 5–8 fps real-time |
| **Video Upload Analysis** | MP4/AVI/MOV/WebM · Frame-by-frame incident timeline |
| **YouTube Analysis** | Paste URL → automatic download and analysis via yt-dlp |
| **Screen Recording Support** | Detects violence even from phone/laptop screens shown to camera |
| **Real-time Dashboard** | Socket.IO push alerts · No polling required |
| **Role-based Access** | Admin / Police / CCTV Operator permissions |
| **GPS Location Tracking** | Geolocation tagged to every alert · Google Maps links |
| **Auto Evidence Recording** | MediaRecorder auto-clips 5-second webm on high-risk events |
| **Voice Alerts** | Web Speech API announces violence detections |
| **Smart Deduplication** | Temporal scoring requires 3+ consecutive frames before alert |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# ML Service
cd ml_service && pip install -r requirements.txt
```

### 2. Start All Services

**Windows — double-click:**
```
start-sentinel.bat
```

**Or manually:**
```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — ML Service
cd ml_service && python app.py
```

### 3. Open Browser

**http://localhost:5173**

---

## 🔐 Default Accounts

| Username | Password | Role | Access |
|---|---|---|---|
| `admin` | `admin123` | 👑 Admin | Full system access |
| `NYPD` | `nypd@123` | 🚔 Police | Audit, investigate, resolve |
| `operator` | `operator123` | 📷 CCTV Ops | Webcam, upload, report |

---

## 🧠 ML Pipeline

### Detection Engine
```
Frame Input (112×112 RGB)
      ↓
Screen recording correction (CLAHE + bilateral filter)
      ↓
YOLOv8n → Person detection + bounding boxes
      ↓
MobileNetV2 → Violence classification
  [Fighting | Assault | Normal]
      ↓
Farnebäck Optical Flow → Motion intensity
      ↓
Spatial Rules → Proximity, overlap, velocity
      ↓
Temporal Scoring → Requires 3+ frames persistence
      ↓
Risk: Low / Medium / High
```

### Robustness Features
- **CLAHE** — handles dark CCTV / bright screen glare
- **Screen border detection** — auto-corrects phone/laptop screens shown to camera
- **Asymmetric temporal scoring** — fast rise (+0.35), slow decay (-0.12)
- **Optical flow** — detects motion even without color change
- **Overlap detection** — physical contact between bounding boxes

---

## 🏋️ Training the Model

### 1. Get Kaggle API Key
Download `kaggle.json` from [kaggle.com/account](https://kaggle.com/account) → place at `~/.kaggle/kaggle.json`

### 2. Download Dataset
```bash
cd ml_service/training
python download_dataset.py
```
Downloads `shreyj1729/cctv-fights-dataset` and extracts ~25,000 labeled frames.

### 3. Train
```bash
python train_model.py
```
2-phase MobileNetV2 transfer learning · ~20–30 min on CPU · ~5 min on GPU.

---

## 📁 Project Structure

```
behavior-risk-analysis/
├── backend/                    # Node.js + Express API
│   ├── controllers/
│   │   ├── alertController.js  # Alert management + Socket.IO
│   │   └── authController.js   # JWT auth + in-memory fallback
│   ├── routes/api.js           # Protected API routes
│   ├── socket.js               # Socket.IO singleton
│   └── server.js               # Helmet + rate-limiting + Winston
│
├── frontend/                   # React + Vite
│   └── src/
│       ├── components/
│       │   ├── Dashboard.jsx   # Real-time incident table
│       │   ├── WebcamStream.jsx # Live camera + AI analysis panel
│       │   ├── VideoUpload.jsx  # Upload + YouTube analysis
│       │   ├── Login.jsx        # Auth with demo accounts
│       │   └── Navbar.jsx       # Role-based navigation
│       ├── App.jsx              # Toast context + routing
│       └── index.css            # Command-center design system
│
├── ml_service/                  # Flask + PyTorch ML service
│   ├── prediction/
│   │   └── predictor.py         # Core detection engine v3.0
│   ├── preprocessing/
│   │   └── image_processor.py   # CLAHE + screen correction + optical flow
│   ├── training/
│   │   ├── download_dataset.py  # Kaggle dataset downloader
│   │   ├── train_model.py       # PyTorch MobileNetV2 trainer
│   │   └── TRAINING_GUIDE.md    # Full training documentation
│   └── app.py                   # Flask API endpoints
│
└── start-sentinel.bat           # One-click startup script
```

---

## 🔒 Security

- JWT authentication on all protected routes
- Helmet.js (12 security headers)
- Rate limiting: 500 req/min global · 20/15min auth
- Roles enforced server-side from JWT (never from client)
- Hardcoded fallback secrets replaced with env vars

---

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/login` | ❌ | Get JWT token |
| POST | `/api/register` | ❌ | Create account |
| GET | `/api/alerts` | ✅ | List all incidents |
| GET | `/api/stats` | ✅ | Dashboard stats |
| PUT | `/api/alerts/:id` | ✅ | Update status |
| DELETE | `/api/alerts/:id` | ✅ | Delete alert |
| POST | `/api/webcam-proxy` | ✅ | Analyze webcam frame |
| POST | `/api/analyze-video` | ✅ | Analyze uploaded video |
| POST | `/api/analyze-youtube` | ✅ | Analyze YouTube URL |
| GET | `/api/health` | ❌ | Service health check |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Socket.IO client |
| Backend | Node.js, Express, Socket.IO, JWT, Helmet, Winston |
| ML Service | Flask, PyTorch, torchvision MobileNetV2 |
| Person Detection | YOLOv8n (ultralytics) |
| Video Download | yt-dlp |
| Database | MongoDB (optional) + in-memory fallback |

---

## 📄 License

MIT License — see [LICENSE](LICENSE)
