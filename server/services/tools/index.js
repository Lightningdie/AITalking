/**
 * 工具模块统一导出
 *
 * 后续新增工具（web_search / generate_image / calculator 等）在各自文件中定义，
 * 由 registry.js 统一注册，此处仅做模块出口。
 */
'use strict';

const registry = require('./registry');
const documentTool = require('./document');

module.exports = {
  registry,
  documentTool
};
