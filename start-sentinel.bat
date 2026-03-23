@echo off
echo ============================================
echo   SENTINEL AI — Starting All Services
echo ============================================
echo.

:: Kill any existing Node processes
echo [1/3] Stopping old processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start Backend
echo [2/3] Starting Backend (port 4005)...
start "Sentinel Backend" cmd /k "cd /d C:\Users\ASUS\Desktop\Ponna\behavior-risk-analysis\backend && node server.js"
timeout /t 3 /nobreak >nul

:: Start Frontend  
echo [3/3] Starting Frontend (port 5173)...
start "Sentinel Frontend" cmd /k "cd /d C:\Users\ASUS\Desktop\Ponna\behavior-risk-analysis\frontend && npm run dev"

echo.
echo ============================================
echo   All services starting...
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:4005
echo ============================================
echo.
echo Opening browser in 6 seconds...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"
