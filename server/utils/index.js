/**
 * 工具模块统一导出
 */
const response = require('./response');
const request = require('./request');

module.exports = {
  ...response,
  ...request
};
