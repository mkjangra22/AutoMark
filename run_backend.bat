@echo off
setlocal
echo ===================================================
echo   AutoMark Face Recognition Backend Starter
echo ===================================================

if "%BACKEND_VENV%"=="" set "BACKEND_VENV=venv"

if not exist "%BACKEND_VENV%\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv "%BACKEND_VENV%"
)

echo Activating virtual environment...
call "%BACKEND_VENV%\Scripts\activate.bat"

echo Installing backend requirements...
python -m pip install -r backend/requirements.txt

echo Starting backend server...
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
