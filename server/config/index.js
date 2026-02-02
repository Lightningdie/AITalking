/**
 * 配置模块统一导出
 */
const API_CONFIG = require('./api.config');
const MIME_TYPES = require('./mime.config');
const { PORT, DEFAULT_TEXT } = require('./constants');

module.exports = {
  API_CONFIG,
  MIME_TYPES,
  PORT,
  DEFAULT_TEXT
};
