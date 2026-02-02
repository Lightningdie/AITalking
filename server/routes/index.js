/**
 * 路由模块统一导出
 */
const { handleStaticRoutes } = require('./static');
const { handleChatProxy } = require('./chat');
const { handleSSE } = require('./sse');
const { handlePause, handleResume } = require('./control');

module.exports = {
  handleStaticRoutes,
  handleChatProxy,
  handleSSE,
  handlePause,
  handleResume
};
