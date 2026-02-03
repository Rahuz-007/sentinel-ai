@echo off
echo ========================================
echo MongoDB Quick Setup for Windows
echo ========================================
echo.

REM Check if MongoDB is already installed
where mongod >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] MongoDB is already installed!
    mongod --version
    echo.
    goto :check_service
)

echo [!] MongoDB is NOT installed
echo.
echo Please choose an installation method:
echo.
echo 1. Download MongoDB Community Edition (Recommended)
echo    - Visit: https://www.mongodb.com/try/download/community
echo    - Download and run the MSI installer
echo    - Choose "Complete" installation
echo    - Install as Windows Service
echo.
echo 2. Use MongoDB Atlas (Cloud - Free)
echo    - Visit: https://www.mongodb.com/cloud/atlas/register
echo    - Create free account and cluster
echo    - Get connection string
echo    - Update backend/.env with connection string
echo.
echo 3. Use Docker
echo    - Run: docker run -d -p 27017:27017 --name mongodb mongo:latest
echo.
echo Press any key to open MongoDB download page...
pause >nul
start https://www.mongodb.com/try/download/community
goto :end

:check_service
echo Checking MongoDB service status...
sc query MongoDB >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] MongoDB service exists
    sc query MongoDB | find "RUNNING" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] MongoDB is RUNNING
    ) else (
        echo [!] MongoDB service is not running
        echo Starting MongoDB service...
        net start MongoDB
    )
) else (
    echo [!] MongoDB service not found
    echo MongoDB might be installed but not configured as a service
    echo.
    echo To start MongoDB manually, run:
    echo    mongod --dbpath "C:\data\db"
)

echo.
echo ========================================
echo Testing MongoDB Connection...
echo ========================================
cd /d "%~dp0backend"
node test-mongodb.js

:end
echo.
echo See MONGODB_SETUP.md for detailed instructions
pause
