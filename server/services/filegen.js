/**
 * 文件生成服务：把 AI 输出的 Markdown 转成 docx / xlsx / md
 * 文件统一落盘到 D:\talkingLog\files\
 */const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} = require('docx');
const ExcelJS = require('exceljs');
const { STORAGE_ROOT } = require('../config/storage.config');

const FILES_DIR = path.join(STORAGE_ROOT, 'files');

function safeName(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50);
}

/** 解析行内 Markdown（粗体/斜体/行内代码），转成 docx TextRun */
function parseInlineRuns(text, { bold = false } = {}) {
  const runs = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), bold }));
    }
    if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3] !== undefined) {
      runs.push(new TextRun({ text: match[3], italics: true, bold }));
    } else if (match[4] !== undefined) {
      runs.push(new TextRun({ text: match[4], font: 'Consolas', bold }));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), bold }));
  }
  return runs.length ? runs : [new TextRun({ text, bold })];
}

/** Markdown 表格解析：返回 { header: string[], rows: string[][] }[] */
function parseMarkdownTables(markdown) {
  const tables = [];
  const lines = markdown.split('\n');
  let current = null;

  const splitRow = (line) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = splitRow(line);
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // 分隔行
      if (!current) current = [];
      current.push(cells);
    } else if (current) {
      tables.push(current);
      current = null;
    }
  }
  if (current) tables.push(current);

  return tables.map((rows) => ({ header: rows[0], rows: rows.slice(1) }));
}

/**
 * Markdown → docx Buffer
 * 支持：标题、段落、无序/有序列表、代码块、引用、表格、分隔线
 */
async function markdownToDocx(markdown, title) {
  const children = [];
  const lines = markdown.split('\n');
  let i = 0;
  let listIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      for (const codeLine of codeLines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: codeLine || ' ', font: 'Consolas', size: 18 })],
          shading: { fill: 'F0F2F5' },
          spacing: { before: 0, after: 0 }
        }));
      }
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      listIndex = 0;
      continue;
    }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const [table] = parseMarkdownTables(tableLines.join('\n'));
      if (table) {
        const headerRow = new TableRow({
          children: table.header.map((cell) => new TableCell({
            children: [new Paragraph({ children: parseInlineRuns(cell, { bold: true }) })],
            shading: { fill: 'F0F2F5' }
          }))
        });
        const bodyRows = table.rows.map((row) => new TableRow({
          children: row.map((cell) => new TableCell({
            children: [new Paragraph({ children: parseInlineRuns(cell) })]
          }))
        }));
        children.push(new Table({
          rows: [headerRow, ...bodyRows],
          width: { size: 100, type: WidthType.PERCENTAGE }
        }));
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      }
      listIndex = 0;
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const levels = [
        HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6
      ];
      children.push(new Paragraph({
        children: parseInlineRuns(headingMatch[2], { bold: true }),
        heading: levels[level - 1],
        spacing: { before: 240, after: 120 }
      }));
      listIndex = 0;
      i++;
      continue;
    }

    // 引用
    if (line.startsWith('> ')) {
      children.push(new Paragraph({
        children: parseInlineRuns(line.slice(2)),
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '0969DA', space: 8 } },
        spacing: { before: 60, after: 60 }
      }));
      listIndex = 0;
      i++;
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line)) {
      children.push(new Paragraph({
        children: parseInlineRuns(line.replace(/^[-*+]\s+/, '')),
        bullet: { level: 0 },
        spacing: { after: 40 }
      }));
      listIndex = 0;
      i++;
      continue;
    }

    // 有序列表
    const orderedMatch = line.match(/^\d+[.、]\s+(.*)/);
    if (orderedMatch) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${++listIndex}. `, bold: true }),
          ...parseInlineRuns(orderedMatch[1])
        ],
        indent: { left: 360 },
        spacing: { after: 40 }
      }));
      i++;
      continue;
    }

    // 分隔线
    if (/^---+\s*$/.test(line)) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 4 } },
        spacing: { before: 120, after: 120 },
        children: []
      }));
      listIndex = 0;
      i++;
      continue;
    }

    // 普通段落
    if (line.trim()) {
      children.push(new Paragraph({
        children: parseInlineRuns(line),
        spacing: { after: 100 }
      }));
    }
    listIndex = 0;
    i++;
  }

  const doc = new Document({
    creator: 'AI Chat',
    title,
    sections: [{ children }]
  });

  return Packer.toBuffer(doc);
}

/**
 * Markdown → xlsx Buffer
 * 每个 Markdown 表格一个 sheet；无表格时正文写入"内容" sheet
 */
async function markdownToXlsx(markdown, title) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AI Chat';

  const tables = parseMarkdownTables(markdown);

  if (tables.length > 0) {
    tables.forEach((table, idx) => {
      const ws = wb.addWorksheet(`表${idx + 1}`);
      const headerRow = ws.addRow(table.header);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F2F5' } };
        cell.border = { bottom: { style: 'thin' } };
      });
      for (const row of table.rows) {
        ws.addRow(row.map((cell) => {
          const num = Number(cell.replace(/,/g, ''));
          return cell !== '' && !Number.isNaN(num) ? num : cell;
        }));
      }
      ws.columns.forEach((col) => {
        let maxLen = 8;
        col.eachCell({ includeEmpty: false }, (cell) => {
          maxLen = Math.max(maxLen, String(cell.value ?? '').length * 2);
        });
        col.width = Math.min(maxLen, 50);
      });
    });
  }

  // 正文文本（去掉表格行）写入"内容" sheet
  const textLines = markdown.split('\n').filter((l) => !/^\s*\|.*\|\s*$/.test(l)).map((l) => l.trim());
  const hasContent = textLines.some(Boolean);
  if (hasContent) {
    const ws = wb.addWorksheet('内容');
    for (const line of textLines) {
      if (line) ws.addRow({ text: line.replace(/[*`#>]/g, '') });
    }
    ws.getColumn(1).width = 100;
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 生成文档文件并落盘
 * @returns {{ fileName: string, url: string }}
 */
async function generateDocument({ type, title, markdown }) {
  fs.mkdirSync(FILES_DIR, { recursive: true });

  const baseName = `${safeName(title)}_${Date.now()}`;
  let fileName;
  let buffer;

  if (type === 'docx') {
    fileName = `${baseName}.docx`;
    buffer = await markdownToDocx(markdown, title);
  } else if (type === 'xlsx') {
    fileName = `${baseName}.xlsx`;
    buffer = await markdownToXlsx(markdown, title);
  } else if (type === 'md') {
    // Markdown 原样落盘，不做格式转换
    fileName = `${baseName}.md`;
    buffer = Buffer.from(markdown, 'utf-8');
  } else {
    throw new Error(`Unsupported document type: ${type}`);
  }

  const filePath = path.join(FILES_DIR, fileName);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  return { fileName, url: `/api/tools/files/${encodeURIComponent(fileName)}` };
}

/** 文件是否在本服务的管辖范围内（防路径穿越） */
function resolveSafeFilePath(subPath) {
  const target = path.normalize(path.join(FILES_DIR, subPath));
  if (!target.startsWith(FILES_DIR)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

module.exports = {
  generateDocument,
  resolveSafeFilePath,
  FILES_DIR
};
