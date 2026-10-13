/**
 * 工具注册表（P1-2）
 *
 * designDoc/AgentHarness能力建设设计文档.md §4.2。
 * 每个工具 = 一份声明（供模型）+ 一个执行器（供内核）+ 权限标记（供安全层）：
 *   {
 *     name, definition,       // definition 为 OpenAI/智谱 tools 格式（type/function/{name,description,parameters}）
 *     permission: 'auto' | 'confirm',   // P2 起支持 confirm（toolConfirm 事件 + 前端确认）
 *     timeoutMs,              // 默认 30000
 *     execute: async (args) => ({ ... })  // 返回值序列化后回填 role:'tool'
 *   }
 *
 * 职责：
 *   - toApiTools()        导出智谱 tools 数组，供 llmproxy 下发
 *   - execute(name, args) 白名单校验（未注册返回错误结果回填）+ 超时控制 + 异常捕获 + 结果体积护栏
 */
'use strict';

const documentTool = require('./document');

/** 结果体积护栏：序列化后超过该字符数即截断（设计文档 §4.2） */
const MAX_RESULT_CHARS = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

/** name → tool */
const registry = new Map();

/**
 * 注册工具（重名即覆盖更新）
 */
function register(tool) {
  if (!tool || !tool.name || typeof tool.execute !== 'function') {
    throw new Error('Invalid tool definition: name / execute are required');
  }
  registry.set(tool.name, tool);
}

register(documentTool);

/**
 * 导出智谱 tools 数组（name/description/parameters），供请求体 tools 字段
 */
function toApiTools() {
  return Array.from(registry.values()).map((t) => t.definition);
}

/**
 * 执行工具：永不 throw，异常/超时/未注册一律转为错误结果回填，
 * 让模型自行决定重试、换参数或告知用户（设计文档 §4.2）。
 * @param {string} name 工具名
 * @param {Object} args 已 JSON.parse 的参数
 * @returns {Object} 工具结果（JSON 可序列化对象）
 */
async function execute(name, args) {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, error: `未注册的工具: ${name}` };
  }

  const timeoutMs = tool.timeoutMs || DEFAULT_TIMEOUT_MS;
  let result;
  try {
    result = await Promise.race([
      Promise.resolve(tool.execute(args)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`工具执行超时（${timeoutMs}ms）`)), timeoutMs)
      )
    ]);
  } catch (error) {
    result = { ok: false, error: error.message };
  }

  return truncateResult(result);
}

/**
 * 结果体积护栏：序列化后超限则截断，附说明让模型感知
 */
function truncateResult(result) {
  let text;
  try {
    text = JSON.stringify(result ?? { ok: true });
  } catch {
    return { ok: true, note: '工具返回了不可序列化的结果' };
  }
  if (text.length <= MAX_RESULT_CHARS) {
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true };
    }
  }
  return {
    ok: true,
    truncated: true,
    note: `工具结果超过 ${MAX_RESULT_CHARS} 字符，已截断（仅保留前缀预览）`,
    preview: text.slice(0, MAX_RESULT_CHARS)
  };
}

module.exports = {
  register,
  toApiTools,
  execute
};
