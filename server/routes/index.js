/**
 * 路由模块统一导出
 */
const { handleStaticRoutes } = require('./static');
const { handleChatProxy } = require('./chat');
const { handleSSE } = require('./sse');
const { handlePause, handleResume } = require('./control');
const {
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation
} = require('./history');

module.exports = {
  handleStaticRoutes,
  handleChatProxy,
  handleSSE,
  handlePause,
  handleResume,
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation
};
