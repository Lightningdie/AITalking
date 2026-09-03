/**
 * 对话历史记录路由
 */
const { jsonResponse } = require('../utils/response');
const { readBody } = require('../utils/request');
const {
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation
} = require('../services/database');

/**
 * GET /api/conversations - 对话列表
 */
function handleListConversations(res) {
  try {
    jsonResponse(res, 200, { conversations: listConversations() });
  } catch (error) {
    console.error('List conversations error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
}

/**
 * POST /api/conversations - 保存对话（整体覆盖）
 */
async function handleSaveConversation(req, res) {
  try {
    const body = await readBody(req);
    const { id, title, provider, model, messages } = body;

    if (!id || typeof id !== 'string') {
      jsonResponse(res, 400, { error: 'id is required' });
      return;
    }
    if (!Array.isArray(messages)) {
      jsonResponse(res, 400, { error: 'messages array is required' });
      return;
    }

    const result = saveConversation({
      id,
      title: title || '未命名对话',
      provider,
      model,
      messages
    });
    jsonResponse(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('Save conversation error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
}

/**
 * GET /api/conversations/:id - 对话详情（含消息）
 */
function handleGetConversation(id, res) {
  try {
    const data = getConversation(id);
    if (!data) {
      jsonResponse(res, 404, { error: 'Conversation not found' });
      return;
    }
    jsonResponse(res, 200, data);
  } catch (error) {
    console.error('Get conversation error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
}

/**
 * DELETE /api/conversations/:id - 删除对话
 */
function handleDeleteConversation(id, res) {
  try {
    deleteConversation(id);
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
}

module.exports = {
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation
};
