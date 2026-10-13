@echo off
rem 一键启动语音服务（Windows）
cd /d %~dp0

if not exist .venv (
  echo [voice-service] 首次运行，创建虚拟环境...
  python -m venv .venv
  if errorlevel 1 (
    echo 未找到 Python，请先安装 Python 3.10+ 并加入 PATH
    pause
    exit /b 1
  )
)

call .venv\Scripts\activate.bat
python -c "import fastapi, edge_tts" 2>nul || (
  echo [voice-service] 安装依赖...
  pip install -r requirements.txt
)

echo [voice-service] 启动中... 首次启动需下载/加载 ASR 模型，请耐心等待
python app.py
pause
