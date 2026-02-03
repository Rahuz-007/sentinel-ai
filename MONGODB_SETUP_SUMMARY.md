# MongoDB Setup Summary

## Current Status
❌ **MongoDB is NOT installed on your system**

Your application is currently running with **in-memory storage**, which means:
- ✅ The app works fine for testing
- ❌ All data is lost when you restart the server
- ❌ No persistent storage of alerts and analysis results

## What I've Fixed

### 1. **Updated Backend Code** ✅
- Modified `backend/controllers/alertController.js` to save alerts to MongoDB first
- Added fallback to in-memory storage if MongoDB is unavailable
- Improved error handling and logging
- Updated `backend/server.js` with better connection management

### 2. **Created Setup Tools** ✅
- `MONGODB_SETUP.md` - Comprehensive setup guide
- `backend/test-mongodb.js` - Connection test script
- `check-mongodb.ps1` - Automated status checker
- `setup-mongodb.bat` - Windows setup helper

## Next Steps: Choose ONE Option

### 🏆 Option 1: MongoDB Community Edition (Recommended for Local Development)

**Pros:** Full control, works offline, no account needed
**Cons:** Requires installation (~500MB)

#### Steps:
1. **Download MongoDB:**
   - Visit: https://www.mongodb.com/try/download/community
   - Select: Windows, MSI package
   - Download latest version (7.0+)

2. **Install:**
   - Run the downloaded `.msi` file
   - Choose "Complete" installation
   - ✅ Check "Install MongoDB as a Service"
   - ✅ Check "Install MongoDB Compass" (optional GUI)
   - Complete installation

3. **Verify:**
   ```powershell
   mongod --version
   Get-Service MongoDB
   ```

4. **Test Connection:**
   ```powershell
   cd d:\behavior-risk-analysis\backend
   node test-mongodb.js
   ```

5. **Restart Your App:**
   - Stop current services (Ctrl+C)
   - Run `start_all.bat` again
   - Look for "✅ MongoDB Connected Successfully!"

---

### ☁️ Option 2: MongoDB Atlas (Cloud - Free Tier)

**Pros:** No installation, accessible anywhere, automatic backups
**Cons:** Requires internet, 512MB limit on free tier

#### Steps:
1. **Create Account:**
   - Visit: https://www.mongodb.com/cloud/atlas/register
   - Sign up (free)

2. **Create Cluster:**
   - Choose "Free" tier (M0)
   - Select region closest to you
   - Click "Create Cluster"

3. **Setup Access:**
   - Go to "Database Access" → Add user
   - Create username/password (save these!)
   - Set role: "Read and write to any database"

4. **Setup Network:**
   - Go to "Network Access" → Add IP Address
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - Confirm

5. **Get Connection String:**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy connection string (looks like):
     ```
     mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```

6. **Update Configuration:**
   Edit `d:\behavior-risk-analysis\backend\.env`:
   ```env
   PORT=4005
   MONGODB_URI=mongodb+srv://your_username:your_password@cluster0.xxxxx.mongodb.net/behavior_risk_db?retryWrites=true&w=majority
   ML_SERVICE_URL=http://localhost:5000
   ```

7. **Test Connection:**
   ```powershell
   cd d:\behavior-risk-analysis\backend
   node test-mongodb.js
   ```

8. **Restart Your App:**
   - Stop current services
   - Run `start_all.bat`

---

### 🐳 Option 3: Docker (Quickest Setup)

**Pros:** Fastest setup, isolated environment
**Cons:** Requires Docker Desktop

#### Steps:
1. **Ensure Docker is Running:**
   ```powershell
   docker --version
   ```

2. **Run MongoDB Container:**
   ```powershell
   docker run -d -p 27017:27017 --name mongodb -v mongodb_data:/data/db mongo:latest
   ```

3. **Verify:**
   ```powershell
   docker ps
   ```

4. **Test Connection:**
   ```powershell
   cd d:\behavior-risk-analysis\backend
   node test-mongodb.js
   ```

5. **Restart Your App:**
   - Stop current services
   - Run `start_all.bat`

**To stop MongoDB later:**
```powershell
docker stop mongodb
```

**To start MongoDB again:**
```powershell
docker start mongodb
```

---

## Verification

After setup, you should see in your backend logs:
```
🔗 Attempting MongoDB connection...
📍 URI: mongodb://127.0.0.1:27017/behavior_risk_db
✅ MongoDB Connected Successfully!
📊 Database: behavior_risk_db
🌐 Host: 127.0.0.1:27017
```

When you analyze videos or create alerts, you'll see:
```
✅ Alert saved to MongoDB: 65f8a9b2c3d4e5f6g7h8i9j0
```

## Current Behavior (Without MongoDB)

Right now, your app is working but using in-memory storage:
- Alerts are stored in RAM
- Data is lost on server restart
- You'll see: `⚠️ Running with IN-MEMORY storage`

## Benefits After MongoDB Setup

✅ **Persistent Storage** - Data survives server restarts
✅ **Historical Data** - Track all alerts over time
✅ **Better Performance** - Efficient querying and indexing
✅ **Scalability** - Handle thousands of alerts
✅ **Data Analysis** - Run reports on historical data

## Need Help?

Run the test script anytime:
```powershell
cd d:\behavior-risk-analysis\backend
node test-mongodb.js
```

Check status:
```powershell
powershell -ExecutionPolicy Bypass -File .\check-mongodb.ps1
```

---

**Recommendation:** For college projects and local development, I recommend **Option 1 (MongoDB Community Edition)**. It's free, works offline, and gives you full control.
