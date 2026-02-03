# Setup Guide - Step by Step

## Prerequisites Check

Before starting, ensure you have:
- [ ] Python 3.8 or higher installed
- [ ] Node.js 16 or higher installed
- [ ] MongoDB installed and running
- [ ] Git (optional, for version control)

### Verify Prerequisites

```bash
# Check Python version
python --version

# Check Node.js version
node --version

# Check npm version
npm --version

# Check MongoDB status
# Windows: Check Services or run
mongod --version
```

## Step 1: ML Service Setup (Python Flask)

### 1.1 Navigate to ML Service Directory
```bash
cd ml_service
```

### 1.2 Create Virtual Environment (Recommended)
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate

# Linux/Mac:
source venv/bin/activate
```

### 1.3 Install Python Dependencies
```bash
pip install -r requirements.txt
```

**Expected packages:**
- flask
- flask-cors
- tensorflow
- opencv-python
- numpy
- twilio
- python-dotenv
- pillow

### 1.4 Configure Environment Variables
```bash
# Copy example file
copy .env.example .env

# Edit .env file with your credentials
notepad .env
```

**Required configurations:**
```env
# Email Configuration (Gmail)
EMAIL_SENDER=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_RECEIVER=police@example.com

# Twilio SMS (Optional)
TWILIO_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE=+1234567890
ADMIN_PHONE=+1234567890
```

**How to get Gmail App Password:**
1. Go to Google Account Settings
2. Security → 2-Step Verification (enable if not enabled)
3. App Passwords → Generate new password
4. Use this password in .env file

### 1.5 Prepare Dataset (Optional for Demo)

**Option A: Quick Demo (No Dataset)**
```bash
# Just run training script - it will create a dummy model
python training/train.py
```

**Option B: Real Dataset**
1. Create dataset structure:
   ```
   dataset/
   ├── Fighting/
   ├── Assault/
   └── Normal/
   ```
2. Add images (500+ per category recommended)
3. Run training:
   ```bash
   python training/train.py
   ```

### 1.6 Test ML Service
```bash
# Start the Flask app
python app.py
```

**Expected output:**
```
* Running on http://0.0.0.0:5000
* Debugger is active!
```

**Test in browser:** http://localhost:5000

---

## Step 2: Backend Setup (Node.js Express)

### 2.1 Navigate to Backend Directory
```bash
# Open new terminal
cd backend
```

### 2.2 Install Node Dependencies
```bash
npm install
```

**Expected packages:**
- express
- mongoose
- cors
- dotenv
- multer
- axios

### 2.3 Configure Environment (Optional)
```bash
# Copy example file
copy .env.example .env

# Edit if needed (default MongoDB connection is fine)
notepad .env
```

**Default configuration:**
```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/behavior_risk_db
ML_SERVICE_URL=http://localhost:5000
```

### 2.4 Start MongoDB

**Windows:**
```bash
# Check if MongoDB service is running
# Services → MongoDB Server → Start

# Or start manually
mongod
```

**Linux/Mac:**
```bash
sudo systemctl start mongod
# or
brew services start mongodb-community
```

### 2.5 Test Backend
```bash
# Start the server
npm start
```

**Expected output:**
```
Server running on port 4000
MongoDB Connected
```

**Test in browser:** http://localhost:4000/api/results

---

## Step 3: Frontend Setup (React + Vite)

### 3.1 Navigate to Frontend Directory
```bash
# Open new terminal
cd frontend
```

### 3.2 Install React Dependencies
```bash
npm install
```

**Expected packages:**
- react
- react-dom
- axios
- vite

### 3.3 Start Development Server
```bash
npm run dev
```

**Expected output:**
```
VITE v4.4.5  ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### 3.4 Open in Browser
Navigate to: **http://localhost:5173**

You should see the Behavioral Risk Analysis dashboard!

---

## Step 4: Verify Everything Works

### 4.1 Check All Services Running

You should have 3 terminals open:
1. **Terminal 1:** ML Service (Port 5000)
2. **Terminal 2:** Backend (Port 4000)
3. **Terminal 3:** Frontend (Port 5173)

### 4.2 Test Webcam Stream
1. Go to "Webcam Stream" tab
2. Click "Start Webcam"
3. Allow camera permissions
4. You should see live feed with predictions

### 4.3 Test Video Upload
1. Go to "Upload Video" tab
2. Select a video file
3. Click "Upload & Analyze"
4. Wait for results

### 4.4 Check Dashboard
1. Go to "Dashboard" tab
2. View recent analysis results
3. Check alert history

---

## Step 5: Using start_all.bat (Windows Only)

For convenience, use the batch script to start all services:

```bash
# From project root
start_all.bat
```

This will open 3 command windows automatically.

---

## Troubleshooting

### ML Service Issues

**Error: "No module named 'tensorflow'"**
```bash
pip install tensorflow
```

**Error: "Model file not found"**
```bash
cd ml_service
python training/train.py
```

**Error: "SMTP Authentication failed"**
- Check Gmail app password
- Ensure 2FA is enabled
- Use app-specific password, not regular password

### Backend Issues

**Error: "MongoDB connection failed"**
```bash
# Start MongoDB service
# Windows: Services → MongoDB Server → Start
# Linux: sudo systemctl start mongod
```

**Error: "Port 4000 already in use"**
```bash
# Change PORT in backend/.env
PORT=4001
```

### Frontend Issues

**Error: "Cannot connect to backend"**
- Ensure backend is running on port 4000
- Check CORS settings
- Verify axios base URL

**Webcam not working:**
- Allow camera permissions in browser
- Use HTTPS in production
- Check browser compatibility

### General Issues

**Services not communicating:**
1. Check all services are running
2. Verify ports: 5000 (ML), 4000 (Backend), 5173 (Frontend)
3. Check firewall settings
4. Ensure correct URLs in configuration

---

## Next Steps

1. ✅ All services running
2. 📊 Test with sample videos
3. 🔔 Configure alert system
4. 📈 Monitor dashboard
5. 🎯 Train model with real data (optional)

---

## Quick Reference

| Service | Port | URL | Command |
|---------|------|-----|---------|
| ML Service | 5000 | http://localhost:5000 | `python app.py` |
| Backend | 4000 | http://localhost:4000 | `npm start` |
| Frontend | 5173 | http://localhost:5173 | `npm run dev` |
| MongoDB | 27017 | mongodb://localhost:27017 | `mongod` |

---

**Need help?** Check README.md or create an issue!
