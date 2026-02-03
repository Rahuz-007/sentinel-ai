@echo off
echo ========================================
echo  Quick Start - Behavior Risk Analysis
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js 16+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if MongoDB is running
echo Checking MongoDB connection...
mongosh --eval "db.version()" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] MongoDB may not be running
    echo Please start MongoDB service before continuing
    echo.
)

echo [1/6] Installing ML Service dependencies...
cd ml_service
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate
pip install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies
    pause
    exit /b 1
)

echo [2/6] Checking for trained model...
if not exist model\cnn_model.h5 (
    echo No model found. Generating dummy model for demo...
    python training\train.py
)

cd ..

echo [3/6] Installing Backend dependencies...
cd backend
if not exist node_modules (
    echo Installing npm packages...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install backend dependencies
        pause
        exit /b 1
    )
)
cd ..

echo [4/6] Installing Frontend dependencies...
cd frontend
if not exist node_modules (
    echo Installing npm packages...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install frontend dependencies
        pause
        exit /b 1
    )
)
cd ..

echo.
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Ensure MongoDB is running
echo 2. Run 'start_all.bat' to launch all services
echo 3. Open http://localhost:5173 in your browser
echo.
echo Services will run on:
echo - ML Service:  http://localhost:5000
echo - Backend:     http://localhost:4005
echo - Frontend:    http://localhost:5173
echo.
pause
