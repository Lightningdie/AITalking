/**
 * AI 工具路由：文档生成（docx/xlsx）、文件下载
 */
const fs = require('fs');
const path = require('path');
const { jsonResponse } = require('../utils/response');
const { readBody } = require('../utils/request');
const { generateDocument, resolveSafeFilePath } = require('../services/filegen');

const MIME_BY_EXT = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

/**
 * POST /api/tools/document
 * body: { type: 'docx'|'xlsx'|'md', title: string, markdown: string }
 */
async function handleGenerateDocument(req, res) {
  try {
    const body = await readBody(req);
    const { type, title, markdown } = body;

    if (!['docx', 'xlsx', 'md'].includes(type)) {
      jsonResponse(res, 400, { error: 'type must be docx, xlsx or md' });
      return;
    }
    if (!markdown || typeof markdown !== 'string') {
      jsonResponse(res, 400, { error: 'markdown content is required' });
      return;
    }

    const result = await generateDocument({
      type,
      title: title || 'AI文档',
      markdown
    });
    console.log(`[tools] document generated: ${result.fileName}`);
    jsonResponse(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('Generate document error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
}

/**
 * GET /api/tools/files/... - 下载/预览已生成的文件
 */
function handleToolFile(subPath, res) {
  const filePath = resolveSafeFilePath(subPath);
  if (!filePath) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png'].includes(ext);
  res.writeHead(200, {
    'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
    'Content-Disposition': `${isImage ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

module.exports = {
  handleGenerateDocument,
  handleToolFile
};
