Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MongoDB Status Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if mongod command exists
$mongoInstalled = $null
try {
    $mongoVersion = mongod --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] MongoDB is installed" -ForegroundColor Green
        $mongoInstalled = $true
    }
} catch {
    $mongoInstalled = $false
}

if (-not $mongoInstalled) {
    Write-Host "[X] MongoDB is NOT installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Installation Options:" -ForegroundColor Yellow
    Write-Host "1. MongoDB Community Edition (Local)"
    Write-Host "   Download: https://www.mongodb.com/try/download/community"
    Write-Host ""
    Write-Host "2. MongoDB Atlas (Cloud - Free)"
    Write-Host "   Sign up: https://www.mongodb.com/cloud/atlas/register"
    Write-Host ""
    Write-Host "3. Docker (Quick)"
    Write-Host "   Run: docker run -d -p 27017:27017 --name mongodb mongo:latest"
    Write-Host ""
    Write-Host "See MONGODB_SETUP.md for detailed instructions" -ForegroundColor Cyan
    exit 1
}

# Check MongoDB service
Write-Host ""
Write-Host "Checking MongoDB service..." -ForegroundColor Yellow
$service = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue

if ($service) {
    if ($service.Status -eq "Running") {
        Write-Host "[OK] MongoDB service is RUNNING" -ForegroundColor Green
    } else {
        Write-Host "[!] MongoDB service exists but is NOT running" -ForegroundColor Yellow
        Write-Host "Attempting to start MongoDB service..." -ForegroundColor Yellow
        try {
            Start-Service -Name "MongoDB"
            Write-Host "[OK] MongoDB service started successfully" -ForegroundColor Green
        } catch {
            Write-Host "[X] Failed to start MongoDB service: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[!] MongoDB service not found" -ForegroundColor Yellow
    Write-Host "MongoDB may be installed but not configured as a service" -ForegroundColor Yellow
}

# Test connection
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing MongoDB Connection..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path "$PSScriptRoot\backend"
node test-mongodb.js

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
