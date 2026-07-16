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

echo Installing PyTorch CPU...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

echo Installing backend requirements...
pip install -r backend/requirements.txt

echo Installing facenet-pytorch without dependencies...
pip install --no-deps facenet-pytorch

echo Starting backend server...
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
