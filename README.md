# Sentinel AI: Behavioral Risk Analysis in Surveillance Systems (V2)

A complete end-to-end AI-powered surveillance system that analyzes video feeds and webcam streams to detect risky behaviors (Fighting, Assault). Now upgraded with **V2 Intelligence** featuring human-context awareness and temporal reasoning.

## 🎯 Project Overview

This system combines machine learning, computer vision, and real-time processing to:
- **Detect** risky behaviors from live webcam feeds, uploaded videos, or **YouTube URLs**.
- **Context-Aware Analysis**: Uses YOLOv8 to distinguish between normal proximity and aggressive interaction.
- **Assign** risk levels: High, Medium, or Low with **Temporal Validation** (requires persistence).
- **Alert** authorities via email and SMS when high-risk behavior is confirmed.
- **Reasoning**: Provides real-time "AI Insights" explaining why a detection was made.

## 🏗️ System Architecture

```
┌─────────────────┐
│  React Frontend │ (Port 5173)
│  - Webcam Stream│
│  - YouTube Hub  │
│  - Insights Panel│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Node.js Backend │ (Port 4005)
│  - API Routes   │
│  - In-Memory DB │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Flask ML API   │ (Port 5000)
│  - YOLOv8 (Human)│
│  - CNN (Behavior)│
│  - ABC Pipeline │
└─────────────────┘
```

## 🚀 Key Upgrades (V2)

### 👥 YOLOv8 Human Context
The system now verifies the presence of people before triggering violence detection. It eliminates "phantom" alerts on empty static scenes.

### 🧠 ABC Pipeline (Advanced Behavioral Context)
- **Spatial Intelligence**: Measures relative distance between people.
- **Velocity Vectors**: Tracks the energy/speed of movements.
- **Posture Analysis**: Identifies if subjects are sitting, standing, or crouching.

### ⏳ Temporal Validation
Violence must persist across a **3-4 frame window** before a trigger occurs. This prevents false positives from single-frame artifacts or screen glare.

### 📺 YouTube Analysis Hub
Analyze any surveillance or test clip directly from YouTube. Optimized with low-res fetching (360p) for high-speed AI processing.

## 📁 Project Structure

```
behavior-risk-analysis/
├── ml_service/              # Python Flask ML Service (YOLOv8 + CNN)
│   ├── model/              # CNN weights
│   ├── prediction/         # ABC logic & temporal score
│   └── app.py              # Flask application
│
├── backend/                # Node.js Express Backend
│   ├── controllers/        # Business logic & ML proxy
│   └── server.js           # Express server (Port 4005)
│
├── frontend/               # React.js Frontend
│   └── src/components/     # Webcam & Upload UI
│
└── start_all.bat           # Windows startup script
```

## 🚀 Quick Start

### 1️⃣ ML Service Setup
```bash
cd ml_service
pip install -r requirements.txt
python app.py
```

### 2️⃣ Backend Setup
```bash
cd backend
npm install
npm start
```

### 3️⃣ Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## 🎮 Usage

### Webcam Live Stream
1. Navigate to **Live Webcam**.
2. Click **Start Camera**.
3. Observe the **💡 Insight** box for real-time AI reasoning (e.g., "Normal proximity").

### Video Upload / YouTube
1. Navigate to **Upload Video**.
2. Select **Local Video** or **YouTube Link**.
3. View the **Incident Timeline** showing specific start/end timestamps of detected violence.

## 🛠️ Technologies Used

- **Deep Learning**: TensorFlow, Keras, YOLOv8 (Ultralytics)
- **Computer Vision**: OpenCV, NumPy
- **Downloaders**: yt-dlp (YouTube fetching)
- **Backend Stack**: Node.js, Express, Axios
- **Frontend Stack**: React, Vite, CSS3 (Glassmorphism)

---

**Made with ❤️ for AI-powered surveillance and safety**
