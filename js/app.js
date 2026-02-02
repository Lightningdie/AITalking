/**
 * SSE Typewriter Demo - Main Application
 * 流式消息打字机效果
 */

// ===== State Management =====
const state = {
  eventSource: null,
  connectionId: null,  // 服务端连接 ID
  isPaused: false,
  isStreaming: false,
  displayedText: '',
  currentIndex: 0,
  totalChars: 0
};

// ===== DOM Elements =====
const elements = {
  startBtn: null,
  pauseBtn: null,
  cancelBtn: null,
  pauseIcon: null,
  pauseText: null,
  textDisplay: null,
  cursor: null,
  statusDot: null,
  statusText: null,
  progress: null,
  timestamp: null,
  speedSlider: null,
  speedValue: null,
  textInput: null,
  charCount: null
};

// ===== Initialization =====
function init() {
  // 获取 DOM 元素
  elements.startBtn = document.getElementById('startBtn');
  elements.pauseBtn = document.getElementById('pauseBtn');
  elements.cancelBtn = document.getElementById('cancelBtn');
  elements.pauseIcon = document.getElementById('pauseIcon');
  elements.pauseText = document.getElementById('pauseText');
  elements.textDisplay = document.getElementById('textDisplay');
  elements.cursor = document.getElementById('cursor');
  elements.statusDot = document.getElementById('statusDot');
  elements.statusText = document.getElementById('statusText');
  elements.progress = document.getElementById('progress');
  elements.timestamp = document.getElementById('timestamp');
  elements.speedSlider = document.getElementById('speedSlider');
  elements.speedValue = document.getElementById('speedValue');
  elements.textInput = document.getElementById('textInput');
  elements.charCount = document.getElementById('charCount');

  // 绑定事件
  bindEvents();
}

// ===== Event Bindings =====
function bindEvents() {
  // 速度滑块
  elements.speedSlider.addEventListener('input', (e) => {
    elements.speedValue.textContent = e.target.value + 'ms';
  });

  // 字数统计
  elements.textInput.addEventListener('input', () => {
    const len = elements.textInput.value.length;
    elements.charCount.textContent = len + ' 字';
  });

  // 按钮事件
  elements.startBtn.addEventListener('click', startStream);
  elements.pauseBtn.addEventListener('click', togglePause);
  elements.cancelBtn.addEventListener('click', cancelStream);
}

// ===== Stream Control =====
function startStream() {
  // 重置状态
  state.displayedText = '';
  state.currentIndex = 0;
  state.totalChars = 0;
  state.isPaused = false;
  state.isStreaming = true;
  state.connectionId = null;

  elements.textDisplay.textContent = '';
  elements.cursor.style.display = 'inline-block';
  elements.cursor.classList.remove('paused');

  updateUI('streaming');
  elements.timestamp.textContent = new Date().toLocaleTimeString();

  const speed = elements.speedSlider.value;
  const customText = elements.textInput.value.trim();

  // 构建 URL
  let sseUrl = `/sse?speed=${speed}`;
  if (customText) {
    sseUrl += `&text=${encodeURIComponent(customText)}`;
  }

  state.eventSource = new EventSource(sseUrl);

  state.eventSource.onopen = () => {
    console.log('SSE 连接已建立');
  };

  state.eventSource.onmessage = handleMessage;

  state.eventSource.addEventListener('connected', (event) => {
    const data = JSON.parse(event.data);
    state.connectionId = data.connectionId;
    console.log('收到连接确认, ID:', state.connectionId);
  });

  state.eventSource.addEventListener('done', (event) => {
    console.log('传输完成');
    finishStream();
  });

  state.eventSource.onerror = (error) => {
    console.error('SSE 错误:', error);
    if (state.eventSource.readyState === EventSource.CLOSED) {
      finishStream();
    }
  };
}

function handleMessage(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.char !== undefined) {
      state.totalChars = data.total;
      displayChar(data.char);
      state.currentIndex = data.index + 1;
      updateProgress();
    }
  } catch (e) {
    console.error('解析数据失败:', e);
  }
}

// ===== 暂停/继续控制 =====
async function togglePause() {
  if (!state.connectionId) {
    console.error('没有有效的连接 ID');
    return;
  }

  state.isPaused = !state.isPaused;

  try {
    if (state.isPaused) {
      // 发送暂停请求到服务器
      await fetch(`/pause?id=${state.connectionId}`, { method: 'POST' });
      
      elements.pauseIcon.textContent = '▶';
      elements.pauseText.textContent = '继续';
      elements.cursor.classList.add('paused');
      updateUI('paused');
      console.log('已暂停');
    } else {
      // 发送继续请求到服务器
      await fetch(`/resume?id=${state.connectionId}`, { method: 'POST' });
      
      elements.pauseIcon.textContent = '⏸';
      elements.pauseText.textContent = '暂停';
      elements.cursor.classList.remove('paused');
      updateUI('streaming');
      console.log('已继续');
    }
  } catch (error) {
    console.error('控制请求失败:', error);
    // 回滚状态
    state.isPaused = !state.isPaused;
  }
}

function cancelStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  state.isStreaming = false;
  state.isPaused = false;
  state.connectionId = null;

  elements.cursor.style.display = 'none';
  updateUI('cancelled');
}

function finishStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  state.isStreaming = false;
  state.connectionId = null;

  elements.cursor.style.display = 'none';
  updateUI('completed');
}

// ===== Display Functions =====
function displayChar(char) {
  state.displayedText += char;
  elements.textDisplay.textContent = state.displayedText;
}

function updateProgress() {
  elements.progress.textContent = `${state.currentIndex} / ${state.totalChars}`;
}

// ===== UI State Management =====
function updateUI(uiState) {
  elements.statusDot.className = 'status-dot';

  switch (uiState) {
    case 'streaming':
      elements.startBtn.disabled = true;
      elements.pauseBtn.disabled = false;
      elements.cancelBtn.disabled = false;
      elements.statusDot.classList.add('streaming');
      elements.statusText.textContent = '接收中...';
      break;

    case 'paused':
      elements.statusDot.classList.add('paused');
      elements.statusText.textContent = '已暂停';
      break;

    case 'completed':
      elements.startBtn.disabled = false;
      elements.pauseBtn.disabled = true;
      elements.cancelBtn.disabled = true;
      elements.pauseIcon.textContent = '⏸';
      elements.pauseText.textContent = '暂停';
      elements.statusDot.classList.add('connected');
      elements.statusText.textContent = '已完成 ✓';
      break;

    case 'cancelled':
      elements.startBtn.disabled = false;
      elements.pauseBtn.disabled = true;
      elements.cancelBtn.disabled = true;
      elements.pauseIcon.textContent = '⏸';
      elements.pauseText.textContent = '暂停';
      elements.statusDot.classList.add('error');
      elements.statusText.textContent = '已取消';
      break;

    default:
      elements.startBtn.disabled = false;
      elements.pauseBtn.disabled = true;
      elements.cancelBtn.disabled = true;
      elements.statusText.textContent = '就绪';
  }
}

// ===== Start Application =====
document.addEventListener('DOMContentLoaded', init);
