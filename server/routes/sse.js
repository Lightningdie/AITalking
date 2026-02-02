/**
 * SSE 打字机演示路由
 */
const { DEFAULT_TEXT } = require('../config/constants');
const { setSSEHeaders, sendSSEData } = require('../utils/response');
const { getQueryParam, getQueryParamInt } = require('../utils/request');
const connectionService = require('../services/connection');

/**
 * 处理 SSE 打字机请求
 * @param {URL} url - 请求 URL
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 */
function handleSSE(url, req, res) {
  // 生成连接 ID
  const connectionId = connectionService.generateConnectionId();
  
  // 设置 SSE 响应头
  setSSEHeaders(res);
  
  // 获取参数
  const speed = getQueryParamInt(url, 'speed', 50);
  const customText = getQueryParam(url, 'text');
  const text = customText ? decodeURIComponent(customText) : DEFAULT_TEXT;
  
  // 创建连接状态
  const connectionState = {
    id: connectionId,
    isPaused: false,
    index: 0,
    text: text,
    speed: speed,
    res: res
  };
  
  connectionService.createConnection(connectionId, connectionState);
  
  // 发送连接成功事件
  sendSSEData(res, { status: 'connected', connectionId }, 'connected');
  
  // 启动定时器逐字发送
  const intervalId = startTypewriter(connectionId, text, speed, res);
  
  // 客户端断开连接时清理
  req.on('close', () => {
    clearInterval(intervalId);
    connectionService.removeConnection(connectionId);
    console.log(`Client ${connectionId} disconnected`);
  });
}

/**
 * 启动打字机效果
 */
function startTypewriter(connectionId, text, speed, res) {
  const intervalId = setInterval(() => {
    const conn = connectionService.getConnection(connectionId);
    
    if (!conn) {
      clearInterval(intervalId);
      return;
    }
    
    // 如果暂停，跳过本次发送
    if (conn.isPaused) {
      return;
    }
    
    if (conn.index < text.length) {
      // 发送单个字符
      const char = text[conn.index];
      const data = { char, index: conn.index, total: text.length };
      sendSSEData(res, data);
      conn.index++;
    } else {
      // 发送完成事件
      sendSSEData(res, { status: 'complete' }, 'done');
      clearInterval(intervalId);
      connectionService.removeConnection(connectionId);
      res.end();
    }
  }, speed);
  
  return intervalId;
}

module.exports = {
  handleSSE
};
