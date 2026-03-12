@echo off
echo Starting BrainJar System...
echo.

echo Starting Brain Engine (FastAPI server on port 8000)...
start "Brain Engine" cmd /c "cd /d ""c:\python codes\openclaw-mechanicus-patches-main"" && call .\.venv\Scripts\activate.bat && cd BrainJar && python brain_engine.py"

echo Waiting 5 seconds for brain engine to initialize...
timeout /t 5 /nobreak > nul

echo Starting Dashboard (Node.js server on port 3003)...
start "Dashboard" cmd /c "cd /d ""c:\python codes\openclaw-mechanicus-patches-main\BrainJar\brain-jar"" && node dashboard-v2.js"

echo.
echo Both services started in background windows.
echo Brain Engine: http://localhost:8000
echo Dashboard: http://localhost:3003
echo.
pause