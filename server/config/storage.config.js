/**
 * 对话记录存储配置
 * 可通过环境变量 TALKING_LOG_DIR 覆盖默认路径
 */
const path = require('path');

const STORAGE_ROOT = process.env.TALKING_LOG_DIR || 'D:\\talkingLog';

module.exports = {
  STORAGE_ROOT,
  DB_DIR: path.join(STORAGE_ROOT, 'db'),
  DB_FILE: path.join(STORAGE_ROOT, 'db', 'chat.db')
};
