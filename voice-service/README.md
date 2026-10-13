# 语音服务（voice-service）

AI Talking 的语音能力 sidecar：**ASR 语音识别 + TTS 语音合成**。

```
浏览器 ──录音──▶ Node /api/voice/asr ──▶ Python /asr（FunASR / faster-whisper）──▶ 文字
浏览器 ◀──音频── Node /api/voice/tts ◀── Python /tts（edge-tts）◀── 句子文本
```

前端不直连 Python，统一走 Node 代理（`server/routes/voice.js`）。

## 启动

```bash
# 方式一：Windows 一键启动（自动建 venv + 装依赖）
voice-service\start.bat

# 方式二：手动
cd voice-service
pip install -r requirements.txt
python app.py           # 或在项目根目录: npm run voice
```

服务默认监听 `http://127.0.0.1:5800`，Node 服务器（3000 端口）会自动代理 `/api/voice/*`。
首次启动会在后台下载 ASR 模型（faster-whisper small 约 460MB / FunASR paraformer 约 1GB），
下载完成前 `/asr` 返回 503，`/health` 的 `ready` 字段为 `false`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ASR_ENGINE` | `funasr` | ASR 引擎：`funasr`（中文最优，需装 requirements-funasr.txt）/ `whisper`（兼容性最好）。指定引擎加载失败会自动回退另一个 |
| `WHISPER_MODEL_SIZE` | `small` | faster-whisper 模型档：tiny/base/small/medium/large-v3 |
| `FUNASR_MODEL` | `paraformer-zh` | FunASR 模型名 |
| `TTS_VOICE` | `zh-CN-XiaoxiaoNeural` | edge-tts 音色（如 `zh-CN-YunxiNeural` 男声） |
| `TTS_RATE` | `+0%` | 语速，如 `+10%` |
| `VOICE_HOST` / `VOICE_PORT` | `127.0.0.1` / `5800` | 服务监听地址 |
| `VOICE_SERVICE_URL` | `http://127.0.0.1:5800` | Node 侧代理目标地址 |

启用 FunASR（推荐，中文识别明显更准）：

```bash
pip install -r requirements-funasr.txt
# Windows (PowerShell)
$env:ASR_ENGINE="funasr"; python app.py
# Linux / macOS
ASR_ENGINE=funasr python app.py
```

## 接口

| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| POST | `/asr` | raw 音频二进制（webm/wav/ogg...），`Content-Type` 标明格式 | `{"text": "识别结果"}` |
| POST | `/tts` | `{"text": "文本", "voice": "可选音色"}` | `audio/mpeg` 流 |
| GET | `/health` | - | `{"ok": true, "ready": true, "asr": "...", "tts": "edge-tts", "voice": "..."}` |

## 前端功能对应

- **麦克风按钮**：语音服务在线时走服务端 ASR（`preferServerAsr`），否则浏览器 Web Speech API
- **语音朗读**（头部下拉）：`浏览器` = speechSynthesis；`服务端` = edge-tts
- **流式朗读**：AI 回复按 `。！？；` 等标点切句，句子边流式生成边送合成、按序播放（代码块自动跳过）

## ⚠️ 许可说明（商用前必读）

| 组件 | 许可 | 商用结论 |
|---|---|---|
| faster-whisper | MIT | ✅ 可商用 |
| FunASR（代码） | MIT | ✅ 可商用；但所用模型（ModelScope 上的 paraformer-zh 等）需单独核对模型页许可（多为 Apache-2.0） |
| Web Speech API | 浏览器内置 | ✅ 无额外许可；但 Chrome 实现将音频送往 Google 云端，隐私敏感场景需注意 |
| **edge-tts** | **非开源** | ⚠️ 它是微软 Edge 浏览器 TTS 接口的非官方封装，**无商用授权**，仅建议个人/学习/评估使用 |
| ChatTTS | CC BY-NC 4.0 | ❌ **禁止商用**（本项目未内置，仅作对比） |

**正式商用替换方案**（TTS 引擎设计为可替换，改 `app.py` 的 `/tts` 实现即可）：

- **CosyVoice 2**（阿里，Apache-2.0）：音色克隆 + 流式合成，开源商用首选
- **GPT-SoVITS**（MIT）：少样本音色克隆
- **Piper**（MIT）：超轻量本地合成
- 或采购云服务：Azure TTS / 火山引擎 / 腾讯云（均有商用授权与 SLA）

ASR 商用替代：阿里云/腾讯云付费 ASR，或自部署 Whisper large-v3（MIT）。
