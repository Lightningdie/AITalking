/**
 * 路由模块统一导出
 */
const { handleStaticRoutes } = require('./static');
const { handleChatProxy } = require('./chat');
const { handleAgentChat } = require('./agent');
const { handleSSE } = require('./sse');
const { handlePause, handleResume } = require('./control');
const {
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation
} = require('./history');
const {
  handleGenerateDocument,
  handleToolFile
} = require('./tools');
const {
  handleVoiceAsr,
  handleVoiceTts,
  handleVoiceHealth
} = require('./voice');

module.exports = {
  handleStaticRoutes,
  handleChatProxy,
  handleAgentChat,
  handleSSE,
  handlePause,
  handleResume,
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation,
  handleGenerateDocument,
  handleToolFile,
  handleVoiceAsr,
  handleVoiceTts,
  handleVoiceHealth
};
