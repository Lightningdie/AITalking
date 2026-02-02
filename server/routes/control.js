/**
 * 连接控制路由（暂停/继续）
 */
const { jsonResponse } = require('../utils/response');
const connectionService = require('../services/connection');

/**
 * 处理暂停请求
 * @param {URL} url - 请求 URL
 * @param {Object} res - HTTP 响应对象
 */
function handlePause(url, res) {
  const id = url.searchParams.get('id');
  
  if (connectionService.pauseConnection(id)) {
    jsonResponse(res, 200, { success: true, status: 'paused' });
  } else {
    jsonResponse(res, 404, { success: false, error: 'Connection not found' });
  }
}

/**
 * 处理继续请求
 * @param {URL} url - 请求 URL
 * @param {Object} res - HTTP 响应对象
 */
function handleResume(url, res) {
  const id = url.searchParams.get('id');
  
  if (connectionService.resumeConnection(id)) {
    jsonResponse(res, 200, { success: true, status: 'resumed' });
  } else {
    jsonResponse(res, 404, { success: false, error: 'Connection not found' });
  }
}

module.exports = {
  handlePause,
  handleResume
};
