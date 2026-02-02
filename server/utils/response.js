/**
 * HTTP 响应工具函数
 */
const fs = require('fs');
const path = require('path');
const MIME_TYPES = require('../config/mime.config');

/**
 * 发送 JSON 响应
 * @param {Object} res - HTTP 响应对象
 * @param {number} statusCode - 状态码
 * @param {Object} data - 响应数据
 */
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

/**
 * 发送静态文件
 * @param {string} filePath - 文件路径
 * @param {Object} res - HTTP 响应对象
 */
function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * 设置 SSE 响应头
 * @param {Object} res - HTTP 响应对象
 */
function setSSEHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
}

/**
 * 发送 SSE 数据
 * @param {Object} res - HTTP 响应对象
 * @param {Object|string} data - 要发送的数据
 * @param {string} event - 可选的事件类型
 */
function sendSSEData(res, data, event = null) {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`data: ${payload}\n\n`);
}

/**
 * 处理 CORS 预检请求
 * @param {Object} res - HTTP 响应对象
 */
function handleCORS(res) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
}

module.exports = {
  jsonResponse,
  serveStaticFile,
  setSSEHeaders,
  sendSSEData,
  handleCORS
};
