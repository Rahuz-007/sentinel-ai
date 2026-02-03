 @echo off
echo Starting ML-Based Behavioral Risk Analysis System...

echo Starting ML Service...
start cmd /k "cd ml_service && python app.py"

echo Starting Backend Server...
start cmd /k "cd backend && npm start"

echo Starting Frontend...
start cmd /k "cd frontend && npm run dev"

echo All services started! 
echo Please ensure MongoDB is running.
pause 