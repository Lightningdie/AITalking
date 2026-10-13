/**
 * generate_document 工具（P1-2）
 *
 * 把现有"前端按钮触发"的文档导出能力（routes/tools.js + ChatBubble 的 exportDocument）
 * 迁入工具注册表，使模型可自主决定调用：
 *   - 执行器复用 services/filegen.js（md → docx/xlsx/md，含类型校验）
 *   - 下载复用 routes/tools.js 的 GET /api/tools/files/:name（含防路径穿越）
 *   - 返回 { ok, fileName, url } 序列化后回填 role:'tool'
 *
 * 前端按钮保留，双通道并存（设计文档 §6 P1-2）。
 * permission: 'auto'（生成类工具，无需确认）。
 */
'use strict';

const { generateDocument } = require('../filegen');

const definition = {
  type: 'function',
  function: {
    name: 'generate_document',
    description:
      '把 Markdown 内容生成为可下载的文档文件（docx/xlsx/md）。' +
      '当用户要求导出、生成或下载文档/表格/Word/Excel/Markdown 文件时调用。' +
      '表格内容请使用 Markdown 表格语法，以便正确导出为 Excel。',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['docx', 'xlsx', 'md'],
          description: '目标文件格式'
        },
        title: {
          type: 'string',
          description: '文档标题，将作为文件名（无需扩展名）'
        },
        markdown: {
          type: 'string',
          description: '完整的 Markdown 正文内容'
        }
      },
      required: ['type', 'title', 'markdown']
    }
  }
};

/**
 * 执行文档生成
 * @param {{ type: string, title?: string, markdown: string }} args
 * @returns {{ ok: boolean, fileName?: string, url?: string, error?: string }}
 */
async function execute(args) {
  const { type, title, markdown } = args || {};

  if (!['docx', 'xlsx', 'md'].includes(type)) {
    return { ok: false, error: `不支持的文档类型: ${type}，仅支持 docx/xlsx/md` };
  }
  if (!markdown || typeof markdown !== 'string') {
    return { ok: false, error: 'markdown 正文不能为空' };
  }

  const result = await generateDocument({
    type,
    title: title || 'AI文档',
    markdown
  });
  console.log(`[tools] ${definition.function.name}: ${result.fileName}`);

  return { ok: true, fileName: result.fileName, url: result.url };
}

module.exports = {
  name: definition.function.name,
  definition,
  permission: 'auto',
  timeoutMs: 30000,
  execute
};
