"""
语音服务 sidecar：ASR（语音识别）+ TTS（语音合成）

- ASR 引擎可切换：
    ASR_ENGINE=funasr   阿里达摩院 FunASR（paraformer-zh），中文最优（默认，需 torch）
    ASR_ENGINE=whisper  faster-whisper，无需 torch，对浏览器 webm 录音兼容性最好
  指定引擎加载失败时自动回退到另一个。
- TTS：edge-tts（微软 Edge 在线音色，免费无需 key），商用请切换 CosyVoice，
  详见 voice-service/README.md 的许可说明。

接口：
    POST /asr      body: 音频二进制（audio/webm、wav 等）  → {"text": "..."}
    POST /tts      body: {"text": "...", "voice": "..."}  → audio/mpeg 流
    GET  /health                                          → {"ok": true, ...}
"""
import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
import threading

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import edge_tts

# ==================== 配置 ====================

ASR_ENGINE = os.getenv("ASR_ENGINE", "funasr").lower()      # funasr | whisper
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small")
FUNASR_MODEL = os.getenv("FUNASR_MODEL", "paraformer-zh")
TTS_VOICE = os.getenv("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
TTS_RATE = os.getenv("TTS_RATE", "+0%")
HOST = os.getenv("VOICE_HOST", "127.0.0.1")
PORT = int(os.getenv("VOICE_PORT", "5800"))

MAX_AUDIO_BYTES = 15 * 1024 * 1024
MAX_TTS_CHARS = 2000

app = FastAPI(title="AITalking Voice Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== ASR ====================


class AsrState:
    """ASR 引擎懒加载：模型在后台线程加载，加载期间 /asr 返回 503"""

    def __init__(self):
        self.lock = threading.Lock()
        self.loaded_engine: str | None = None
        self.error: str | None = None
        self._model = None
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        """按优先级尝试加载：指定引擎 → 另一引擎"""
        order = [ASR_ENGINE] + [e for e in ("funasr", "whisper") if e != ASR_ENGINE]
        for engine in order:
            try:
                with self.lock:
                    self._model = self._load_engine(engine)
                    self.loaded_engine = engine
                    self.error = None
                print(f"[asr] 引擎加载完成: {engine}", flush=True)
                return
            except Exception as exc:  # noqa: BLE001
                print(f"[asr] 引擎 {engine} 加载失败: {exc}", file=sys.stderr, flush=True)
        with self.lock:
            self.error = "所有 ASR 引擎加载失败（检查 pip 依赖是否安装完整）"

    @staticmethod
    def _load_engine(engine: str):
        if engine == "funasr":
            from funasr import AutoModel

            return AutoModel(
                model=FUNASR_MODEL,
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                disable_update=True,
            )
        if engine == "whisper":
            from faster_whisper import WhisperModel

            return WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        raise ValueError(f"未知引擎: {engine}")

    def ready(self) -> bool:
        return self.loaded_engine is not None

    def status(self) -> dict:
        return {
            "requested": ASR_ENGINE,
            "loaded": self.loaded_engine,
            "error": self.error,
        }

    def transcribe(self, audio_path: str) -> str:
        with self.lock:
            model, engine = self._model, self.loaded_engine
        if model is None:
            raise RuntimeError(self.error or "ASR 模型加载中，请稍后重试")

        if engine == "funasr":
            result = model.generate(input=audio_path, batch_size_s=300)
            text = result[0]["text"] if result else ""
            try:
                from funasr.utils.postprocess_utils import rich_transcription_postprocess

                text = rich_transcription_postprocess(text)
            except ImportError:
                pass
            return str(text).strip()

        # faster-whisper：自动检测语言，中文场景 bias 到 zh
        segments, _info = model.transcribe(audio_path)
        return "".join(segment.text for segment in segments).strip()


asr_state = AsrState()

# content-type → 临时文件扩展名
SUFFIX_MAP = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
}


def _suffix_for(content_type: str) -> str:
    base = (content_type or "").split(";")[0].strip().lower()
    return SUFFIX_MAP.get(base, ".webm")


def _convert_with_ffmpeg(src: str) -> str | None:
    """funasr 的 torchaudio 后端可能解不了 webm/opus，用 ffmpeg 转 16k wav 兜底"""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    dst = src + ".wav"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", dst],
            check=True,
            timeout=60,
        )
        return dst
    except Exception as exc:  # noqa: BLE001
        print(f"[asr] ffmpeg 转码失败: {exc}", file=sys.stderr, flush=True)
        return None


def transcribe_bytes(data: bytes, content_type: str) -> str:
    """按 引擎直解 → ffmpeg 转码 重试 识别"""
    tmp = tempfile.NamedTemporaryFile(suffix=_suffix_for(content_type), delete=False)
    try:
        tmp.write(data)
        tmp.close()
        candidates = [tmp.name]
        converted = _convert_with_ffmpeg(tmp.name)
        if converted:
            candidates.append(converted)

        last_error: Exception | None = None
        for path in candidates:
            try:
                return asr_state.transcribe(path)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
        raise last_error or RuntimeError("识别失败")
    finally:
        for path in {tmp.name, tmp.name + ".wav"}:
            try:
                os.remove(path)
            except OSError:
                pass


@app.post("/asr")
async def asr(req: Request):
    if not asr_state.ready():
        status = asr_state.status()
        code = 503 if not status["error"] else 500
        return JSONResponse(
            status_code=code,
            content={"error": status["error"] or "ASR 模型加载中，请几秒后重试"},
        )

    data = await req.body()
    if not data:
        return JSONResponse(status_code=400, content={"error": "录音内容为空"})
    if len(data) > MAX_AUDIO_BYTES:
        return JSONResponse(status_code=413, content={"error": "录音文件过大"})

    text = await asyncio.to_thread(transcribe_bytes, data, req.headers.get("content-type", ""))
    return {"text": text}


# ==================== TTS ====================


@app.post("/tts")
async def tts(req: Request):
    try:
        payload = await req.json()
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": "请求体不是合法 JSON"})

    text = (payload.get("text") or "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "合成文本为空"})
    if len(text) > MAX_TTS_CHARS:
        return JSONResponse(status_code=400, content={"error": "合成文本过长"})

    voice = payload.get("voice") or TTS_VOICE

    async def audio_stream():
        communicate = edge_tts.Communicate(text, voice, rate=TTS_RATE)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")


# ==================== 健康 ====================


@app.get("/health")
async def health():
    status = asr_state.status()
    return {
        "ok": True,
        "ready": asr_state.ready(),
        "asr": status["loaded"] or status["requested"],
        "asrError": status["error"],
        "tts": "edge-tts",
        "voice": TTS_VOICE,
    }


if __name__ == "__main__":
    import uvicorn

    print(
        f"[voice-service] 启动于 http://{HOST}:{PORT}  "
        f"ASR_ENGINE={ASR_ENGINE}  TTS_VOICE={TTS_VOICE}",
        flush=True,
    )
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
