# MongoDB Setup Guide for Behavior Risk Analysis

## Option 1: Install MongoDB Community Edition (Recommended for Production)

### Step 1: Download MongoDB
1. Visit: https://www.mongodb.com/try/download/community
2. Select:
   - Version: Latest (7.0 or higher)
   - Platform: Windows
   - Package: MSI
3. Download the installer

### Step 2: Install MongoDB
1. Run the downloaded `.msi` file
2. Choose "Complete" installation
3. **Important**: Check "Install MongoDB as a Service"
4. **Important**: Check "Install MongoDB Compass" (GUI tool)
5. Complete the installation

### Step 3: Verify Installation
Open PowerShell and run:
```powershell
mongod --version
```

### Step 4: Start MongoDB Service
MongoDB should auto-start as a Windows service. To verify:
```powershell
# Check if MongoDB service is running
Get-Service -Name MongoDB

# If not running, start it:
Start-Service -Name MongoDB
```

### Step 5: Test Connection
```powershell
# Connect to MongoDB shell
mongosh
```

---

## Option 2: Use MongoDB Atlas (Cloud - Free Tier Available)

### Step 1: Create Account
1. Visit: https://www.mongodb.com/cloud/atlas/register
2. Sign up for free account
3. Create a free M0 cluster (512MB storage)

### Step 2: Setup Database Access
1. Go to "Database Access" → Add New Database User
2. Create username and password (save these!)
3. Set permissions to "Read and write to any database"

### Step 3: Setup Network Access
1. Go to "Network Access" → Add IP Address
2. Click "Allow Access from Anywhere" (0.0.0.0/0) for development
3. Confirm

### Step 4: Get Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string (looks like):
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 5: Update Backend .env
Replace the MONGODB_URI in `backend/.env`:
```env
MONGODB_URI=mongodb+srv://your_username:your_password@cluster0.xxxxx.mongodb.net/behavior_risk_db?retryWrites=true&w=majority
```

---

## Option 3: Use Docker (Quick Setup)

### Prerequisites
- Docker Desktop installed

### Run MongoDB Container
```powershell
docker run -d -p 27017:27017 --name mongodb -v mongodb_data:/data/db mongo:latest
```

### Verify
```powershell
docker ps
```

---

## After Setup: Restart Your Application

1. Stop the current services (Ctrl+C in the terminal running start_all.bat)
2. Run `start_all.bat` again
3. Check backend logs for "✓ MongoDB Connected Successfully"

---

## Troubleshooting

### Connection Timeout
- Ensure MongoDB service is running
- Check firewall settings
- Verify connection string in `.env`

### Authentication Failed
- Double-check username/password
- Ensure user has proper permissions

### Port Already in Use
```powershell
# Find what's using port 27017
netstat -ano | findstr :27017

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

---

## Verify MongoDB is Working

After setup, test the connection:
```powershell
# From project root
node backend/test-mongodb.js
```
