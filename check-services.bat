@echo off
echo ========================================
echo Checking Service Status
echo ========================================
echo.

echo Checking ML Service (Port 5000)...
curl -s http://localhost:5000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ ML Service is RUNNING on port 5000
) else (
    echo ❌ ML Service is NOT responding on port 5000
)
echo.

echo Checking Backend (Port 4005)...
curl -s http://localhost:4005 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend is RUNNING on port 4005
) else (
    echo ❌ Backend is NOT responding on port 4005
)
echo.

echo Checking Frontend (Port 5173)...
curl -s http://localhost:5173 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Frontend is RUNNING on port 5173
) else (
    echo ❌ Frontend is NOT responding on port 5173
)
echo.

echo ========================================
echo Port Status:
echo ========================================
netstat -ano | findstr "5000 4005 5173"
echo.

echo ========================================
echo MongoDB Connection Status
echo ========================================
cd backend
node test-mongodb.js
cd ..

pause
