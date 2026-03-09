import { memo, useMemo, Fragment, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

export interface MessageContentProps {
  content: string;
}

function MessageContentInner({ content }: MessageContentProps) {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    return parseContent(content);
  }, [content]);

  return <div className="message-text">{renderedContent}</div>;
}

export const MessageContent = memo(MessageContentInner);

/**
 * 仅匹配已闭合的 ```...``` 代码块，流式下未闭合部分当普通文本渲染，防止断语法/报错
 */
const CLOSED_CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

/**
 * 将整段文本拆成「普通 Markdown」与「已闭合代码块」交替的片段，仅闭合的 ```...``` 交给 CodeBlock 高亮
 */
function parseContent(text: string): ReactNode[] | ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = CLOSED_CODE_BLOCK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parts.push(
        <span key={`text-${lastIndex}`}>{formatInlineText(textBefore)}</span>
      );
    }

    const [, language, code] = match;
    parts.push(
      <CodeBlock
        key={`code-${match.index}`}
        code={code.trim()}
        language={language}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push(
      <span key={`text-${lastIndex}`}>{formatInlineText(remaining)}</span>
    );
  }

  return parts.length > 0 ? parts : formatInlineText(text);
}

/** 无序列表行首：- 或 * 后跟空格 */
const UNORDERED_LIST_PREFIX = /^\s*[-*]\s+/;
/** 有序列表行首：数字. 后跟空格 */
const ORDERED_LIST_PREFIX = /^\s*\d+\.\s+/;
/** 标题：1–6 个 # 后跟空格和内容 */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;
/** 水平线：--- 或 *** 或 ___ */
const HR_REGEX = /^(---|\*\*\*|___)\s*$/;
/** 任务列表：- [ ] 或 - [x] */
const TASK_LIST_REGEX = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
/** 表格行：包含 | */
const TABLE_ROW_REGEX = /\|.+\|/;
/** 表格分隔行：|---|---| */
const TABLE_SEP_REGEX = /^\s*\|?(\s*:?[-]+\s*\|)+\s*$/;

interface TaskItem {
  checked: boolean;
  text: string;
}

interface TableParse {
  header: string[];
  rows: string[][];
}

function parseTableLines(lines: string[], start: number): { table: TableParse; nextIndex: number } {
  const headerLine = lines[start];
  const header = splitTableRow(headerLine);
  let nextIndex = start + 1;
  const rows: string[][] = [];

  if (nextIndex < lines.length && TABLE_SEP_REGEX.test(lines[nextIndex])) {
    nextIndex += 1;
  }
  while (nextIndex < lines.length && TABLE_ROW_REGEX.test(lines[nextIndex])) {
    rows.push(splitTableRow(lines[nextIndex]));
    nextIndex += 1;
  }
  return { table: { header, rows }, nextIndex };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const parts = trimmed.split('|').map((p) => p.trim());
  if (parts[0] === '') parts.shift();
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * 按行解析 Markdown：标题、水平线、引用、表格、任务列表、无序/有序列表、普通段落
 */
function formatInlineText(text: string): ReactNode[] | ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const result: ReactNode[] = [];
  let keyIndex = 0;

  let blockquoteLines: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];
  let taskItems: TaskItem[] = [];
  let paragraphLines: string[] = [];

  function flushBlockquote() {
    if (blockquoteLines.length > 0) {
      result.push(
        <blockquote key={`bq-${keyIndex++}`} className="blockquote">
          {blockquoteLines.map((l, i) => (
            <Fragment key={i}>
              {formatLine(l)}
              {i < blockquoteLines.length - 1 && <br />}
            </Fragment>
          ))}
        </blockquote>
      );
      blockquoteLines = [];
    }
  }

  function flushUnorderedList() {
    if (ulItems.length > 0) {
      result.push(
        <ul key={`ul-${keyIndex++}`}>
          {ulItems.map((item, i) => (
            <li key={i}>{formatLine(item)}</li>
          ))}
        </ul>
      );
      ulItems = [];
    }
  }

  function flushOrderedList() {
    if (olItems.length > 0) {
      result.push(
        <ol key={`ol-${keyIndex++}`}>
          {olItems.map((item, i) => (
            <li key={i}>{formatLine(item)}</li>
          ))}
        </ol>
      );
      olItems = [];
    }
  }

  function flushTaskList() {
    if (taskItems.length > 0) {
      result.push(
        <ul key={`task-${keyIndex++}`} className="task-list">
          {taskItems.map((item, i) => (
            <li key={i} className={item.checked ? 'task-list__item--checked' : ''}>
              <span className="task-list__checkbox" aria-hidden>
                {item.checked ? '☑' : '☐'}
              </span>
              {formatLine(item.text)}
            </li>
          ))}
        </ul>
      );
      taskItems = [];
    }
  }

  function flushParagraph() {
    for (let i = 0; i < paragraphLines.length; i++) {
      const line = paragraphLines[i];
      if (line) {
        result.push(
          <span key={`line-${keyIndex++}`}>
            {formatLine(line)}
            {i < paragraphLines.length - 1 && <br />}
          </span>
        );
      } else if (i < paragraphLines.length - 1) {
        result.push(<br key={`br-${keyIndex++}`} />);
      }
    }
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushTaskList();
      flushParagraph();
      const level = Math.min(6, headingMatch[1].length);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      result.push(
        <Tag key={`h-${keyIndex++}`} className={`md-heading md-heading--${level}`}>
          {formatLine(headingMatch[2])}
        </Tag>
      );
      continue;
    }

    if (HR_REGEX.test(line)) {
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushTaskList();
      flushParagraph();
      result.push(<hr key={`hr-${keyIndex++}`} className="md-hr" />);
      continue;
    }

    if (TABLE_ROW_REGEX.test(line)) {
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushTaskList();
      flushParagraph();
      const { table, nextIndex } = parseTableLines(lines, i);
      i = nextIndex - 1;
      result.push(
        <div key={`table-${keyIndex++}`} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {table.header.map((cell, c) => (
                  <th key={c}>{formatLine(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{formatLine(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith('> ')) {
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushTaskList();
      flushParagraph();
      blockquoteLines.push(line.slice(2));
      continue;
    }

    const taskMatch = line.match(TASK_LIST_REGEX);
    if (taskMatch) {
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushParagraph();
      taskItems.push({
        checked: taskMatch[1].toLowerCase() === 'x',
        text: taskMatch[2].trim()
      });
      continue;
    }

    if (UNORDERED_LIST_PREFIX.test(line)) {
      flushBlockquote();
      flushOrderedList();
      flushTaskList();
      flushParagraph();
      ulItems.push(line.replace(UNORDERED_LIST_PREFIX, '').trim());
      continue;
    }

    if (ORDERED_LIST_PREFIX.test(line)) {
      flushBlockquote();
      flushUnorderedList();
      flushTaskList();
      flushParagraph();
      olItems.push(line.replace(ORDERED_LIST_PREFIX, '').trim());
      continue;
    }

    flushBlockquote();
    flushUnorderedList();
    flushOrderedList();
    flushTaskList();
    paragraphLines.push(line);
  }

  flushBlockquote();
  flushUnorderedList();
  flushOrderedList();
  flushTaskList();
  flushParagraph();

  return result.length > 0 ? result : null;
}

/** [显示文本](url) 链接格式 */
const LINK_REGEX = /\[([^\]]*)\]\(([^)]*)\)/g;
/** ![alt](url) 图片格式 */
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]*)\)/g;

/** 仅允许常见安全协议，避免 javascript: 等 */
function isSafeHref(href: string): boolean {
  const t = href.trim().toLowerCase();
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('/') ||
    t.startsWith('#') ||
    t.startsWith('mailto:')
  );
}

/**
 * 单行内：先按行内代码 `...` 切段，每段再解析链接与粗体/斜体
 */
function formatLine(line: string): ReactNode {
  const elements: ReactNode[] = [];
  let lastIndex = 0;
  let keyIdx = 0;

  const codeRegex = /`([^`]+)`/g;
  let match;

  while ((match = codeRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const segment = line.slice(lastIndex, match.index);
      elements.push(parseSegmentWithLinks(segment, keyIdx));
      keyIdx += 1;
    }
    elements.push(
      <code key={`ic-${keyIdx++}`} className="inline-code">
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  if (elements.length > 0) {
    if (lastIndex < line.length) {
      elements.push(parseSegmentWithLinks(line.slice(lastIndex), keyIdx));
    }
    return elements;
  }

  return parseSegmentWithLinks(line, 0);
}

type InlineMatch =
  | { index: number; length: number; type: 'img'; alt: string; url: string }
  | { index: number; length: number; type: 'link'; text: string; url: string };

/** 在无行内代码的片段内解析 ![alt](url) 图片、[text](url) 链接，以及 **粗体** / *斜体* / ~~删除线~~ */
function parseSegmentWithLinks(segment: string, keyBase: number): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let keyIdx = keyBase;

  const allMatches: InlineMatch[] = [];
  IMAGE_REGEX.lastIndex = 0;
  let m;
  while ((m = IMAGE_REGEX.exec(segment)) !== null) {
    allMatches.push({
      index: m.index,
      length: m[0].length,
      type: 'img',
      alt: m[1],
      url: m[2]
    });
  }
  LINK_REGEX.lastIndex = 0;
  while ((m = LINK_REGEX.exec(segment)) !== null) {
    if (segment[m.index - 1] === '!') continue;
    allMatches.push({
      index: m.index,
      length: m[0].length,
      type: 'link',
      text: m[1],
      url: m[2]
    });
  }
  allMatches.sort((a, b) => a.index - b.index);

  for (const match of allMatches) {
    if (match.index > lastIndex) {
      parts.push(
        formatInlineBoldItalic(segment.slice(lastIndex, match.index), `seg-${keyIdx++}`)
      );
    }
    if (match.type === 'img' && isSafeHref(match.url)) {
      parts.push(
        <img
          key={`img-${keyIdx++}`}
          src={match.url}
          alt={match.alt}
          className="md-img"
          loading="lazy"
        />
      );
    } else if (match.type === 'link' && isSafeHref(match.url)) {
      parts.push(
        <a key={`link-${keyIdx++}`} href={match.url} target="_blank" rel="noopener noreferrer">
          {match.text}
        </a>
      );
    } else {
      parts.push(segment.slice(match.index, match.index + match.length));
    }
    lastIndex = match.index + match.length;
  }

  if (parts.length === 0) {
    return (
      <span key={keyBase}>
        {formatInlineBoldItalic(segment, `bi-${keyBase}`)}
      </span>
    );
  }
  if (lastIndex < segment.length) {
    parts.push(
      formatInlineBoldItalic(segment.slice(lastIndex), `seg-${keyIdx}`)
    );
  }
  return <span key={keyBase}>{parts}</span>;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** **粗体**、__粗体__、*斜体*、_斜体_、~~删除线~~ */
function formatInlineBoldItalic(text: string, key: string): ReactNode {
  let result = escapeHtml(text);
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  result = result.replace(/\~\~([^~]+)\~\~/g, '<del>$1</del>');
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

  if (
    result.includes('<strong>') ||
    result.includes('<em>') ||
    result.includes('<del>')
  ) {
    return <span key={key} dangerouslySetInnerHTML={{ __html: result }} />;
  }
  return text;
}

export default MessageContent;
  