# Testing Guide

## Quick Health Check

Run these commands to verify each service is working:

### 1. Test ML Service

```bash
cd ml_service

# Test 1: Check if predictor loads
python -c "from prediction.predictor import predictor; print('✓ Predictor loaded successfully')"

# Test 2: Check if alert system loads
python -c "from utils.alert_system import AlertSystem; print('✓ Alert system loaded successfully')"

# Test 3: Check if model exists
python -c "import os; print('✓ Model exists' if os.path.exists('model/cnn_model.h5') else '✗ Model not found')"
```

### 2. Test Backend

```bash
cd backend

# Test 1: Check dependencies
npm list express mongoose cors multer axios --depth=0

# Test 2: Verify uploads directory exists
# Windows:
if exist uploads echo ✓ Uploads directory exists
# Linux/Mac:
[ -d uploads ] && echo "✓ Uploads directory exists" || echo "✗ Creating uploads directory" && mkdir uploads
```

### 3. Test Frontend

```bash
cd frontend

# Test 1: Check dependencies
npm list react axios --depth=0
```

---

## Integration Testing

### Test 1: Start All Services

**Step 1:** Start ML Service
```bash
cd ml_service
python app.py
```

**Expected Output:**
```
Model loaded successfully.
 * Serving Flask app 'app'
 * Running on http://0.0.0.0:5000
```

**Step 2:** Start Backend (new terminal)
```bash
cd backend
npm start
```

**Expected Output:**
```
Server running on port 4000
MongoDB Connected
```

**Step 3:** Start Frontend (new terminal)
```bash
cd frontend
npm run dev
```

**Expected Output:**
```
VITE v4.4.5  ready in 500 ms
➜  Local:   http://localhost:5173/
```

---

### Test 2: API Endpoint Testing

**Test ML Service Endpoint:**
```bash
# Test if ML service is responding
curl http://localhost:5000/
```

**Test Backend Endpoints:**
```bash
# Get all alerts
curl http://localhost:4000/api/alerts

# Get all results
curl http://localhost:4000/api/results
```

**Expected:** JSON responses (empty arrays if no data yet)

---

### Test 3: Webcam Stream Test

1. Open browser to `http://localhost:5173`
2. Navigate to "Webcam Stream" tab
3. Click "Start Webcam"
4. Allow camera permissions when prompted

**Verify:**
- ✓ Webcam feed displays
- ✓ Predictions update in real-time
- ✓ Class, confidence, and risk level shown
- ✓ No errors in browser console (F12)

**Check Backend Logs:**
- Should see requests coming from frontend

**Check ML Service Logs:**
- Should see prediction requests being processed

---

### Test 4: Video Upload Test

**Prepare Test Video:**
- Any .mp4, .avi, or .mov file
- Recommended: 5-30 seconds long

**Steps:**
1. Navigate to "Upload Video" tab
2. Click "Choose File" and select video
3. Click "Upload & Analyze"
4. Wait for processing

**Verify:**
- ✓ Upload progress shows
- ✓ Processing message appears
- ✓ Results display (behavior, risk level)
- ✓ No errors in console

**Check Backend Terminal:**
```
Processing video: uploads\1705234567890-testvideo.mp4
```

**Check ML Service Terminal:**
```
--- TRIGGERING ALERTS --- (if high risk detected)
Alert System: Email credentials not found. Skipping email.
Alert System: Twilio credentials not found. Skipping SMS.
-------------------------
```

---

### Test 5: Dashboard Test

1. Navigate to "Dashboard" tab
2. Verify table displays uploaded videos

**Verify:**
- ✓ Video name shown
- ✓ Behavior classification shown
- ✓ Risk level badge (colored)
- ✓ Status shown
- ✓ Timestamp formatted correctly
- ✓ Data refreshes every 2 seconds

---

### Test 6: MongoDB Data Verification

**Check if data is being stored:**

```bash
# Connect to MongoDB
mongosh

# Switch to database
use behavior_risk_db

# View all alerts
db.alerts.find().pretty()

# Count alerts
db.alerts.countDocuments()

# Exit
exit
```

**Expected:** Should see alert documents with videoName, behavior, riskLevel, timestamp

---

## Common Issues & Solutions

### Issue 1: ML Service Won't Start

**Error:** `ModuleNotFoundError: No module named 'flask_cors'`

**Solution:**
```bash
cd ml_service
pip install flask-cors
```

---

**Error:** `Model not found at model/cnn_model.h5`

**Solution:**
```bash
cd ml_service
python training/train.py
```

---

### Issue 2: Backend Won't Start

**Error:** `MongoDB Connection Error`

**Solution:**
```bash
# Windows: Start MongoDB service
net start MongoDB

# Linux:
sudo systemctl start mongod

# Mac:
brew services start mongodb-community
```

---

**Error:** `Port 4000 already in use`

**Solution:**
```bash
# Find process using port 4000
# Windows:
netstat -ano | findstr :4000

# Kill process (replace PID)
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:4000 | xargs kill -9
```

---

### Issue 3: Frontend Won't Start

**Error:** `Cannot connect to backend`

**Solution:**
- Ensure backend is running on port 4000
- Check browser console for CORS errors
- Verify axios base URL in components

---

### Issue 4: Webcam Not Working

**Error:** `Permission denied` or `NotAllowedError`

**Solution:**
- Click "Allow" when browser asks for camera permission
- Check browser settings → Privacy → Camera
- Try different browser (Chrome recommended)

---

**Error:** Webcam shows but no predictions

**Solution:**
- Check ML service is running
- Check browser console for errors
- Verify ML service URL in WebcamStream.jsx

---

### Issue 5: Video Upload Fails

**Error:** `No video file uploaded`

**Solution:**
- Ensure file is selected before clicking upload
- Check file format (.mp4, .avi, .mov)
- Check file size (large files may timeout)

---

**Error:** `ML Service failed to process video`

**Solution:**
- Check ML service logs for errors
- Verify video path is accessible
- Try shorter video file

---

## Performance Testing

### Test Frame Processing Speed

Add timing to webcam component:
```javascript
const startTime = Date.now();
// ... prediction call ...
console.log(`Prediction took ${Date.now() - startTime}ms`);
```

**Expected:** 100-500ms per frame (depends on hardware)

---

### Test Video Processing Speed

**Small video (10 seconds):** ~5-15 seconds  
**Medium video (30 seconds):** ~15-45 seconds  
**Large video (1 minute):** ~30-90 seconds

*Times vary based on CPU/GPU*

---

## Alert System Testing

### Test Email Alerts

1. Edit `ml_service/.env`:
```env
EMAIL_SENDER=your_real_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_RECEIVER=test_receiver@gmail.com
```

2. Upload video or use webcam
3. Trigger high-risk detection
4. Check receiver email inbox

**Expected:** Email with subject "URGENT: High Risk Behavior Detected"

---

### Test SMS Alerts (Optional)

1. Sign up for Twilio trial account
2. Get credentials from Twilio dashboard
3. Edit `ml_service/.env`:
```env
TWILIO_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE=+1234567890
ADMIN_PHONE=+0987654321
```

4. Trigger high-risk detection
5. Check phone for SMS

---

## Automated Test Script

Create `test_system.bat`:

```batch
@echo off
echo Testing ML Service...
cd ml_service
python -c "from prediction.predictor import predictor; print('✓ ML Service OK')"
cd ..

echo Testing Backend...
curl -s http://localhost:4000/api/alerts >nul && echo ✓ Backend OK || echo ✗ Backend not responding

echo Testing Frontend...
curl -s http://localhost:5173 >nul && echo ✓ Frontend OK || echo ✗ Frontend not responding

echo.
echo All tests complete!
pause
```

---

## Success Criteria Checklist

- [ ] All 3 services start without errors
- [ ] ML service loads model successfully
- [ ] Backend connects to MongoDB
- [ ] Frontend loads in browser
- [ ] Webcam stream works with real-time predictions
- [ ] Video upload completes successfully
- [ ] Dashboard displays analysis results
- [ ] No critical errors in any console
- [ ] Data persists in MongoDB
- [ ] Alert system triggers on high risk (logs show attempt)

---

**When all tests pass, your system is demo-ready! 🎉**
