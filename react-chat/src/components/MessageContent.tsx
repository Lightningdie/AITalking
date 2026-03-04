import { useMemo, ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

export interface MessageContentProps {
  content: string;
}

export function MessageContent({ content }: MessageContentProps) {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    return parseContent(content);
  }, [content]);

  return <div className="message-text">{renderedContent}</div>;
}

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

/**
 * 按行解析 Markdown：引用、无序/有序列表、普通段落；遇到不同类型先 flush 再切换
 */
function formatInlineText(text: string): ReactNode[] | ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const result: ReactNode[] = [];
  let keyIndex = 0;

  let blockquoteLines: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];
  let paragraphLines: string[] = [];

  function flushBlockquote() {
    if (blockquoteLines.length > 0) {
      result.push(
        <blockquote key={`bq-${keyIndex++}`} className="blockquote">
          {blockquoteLines.join('\n')}
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

    if (line.startsWith('> ')) {
      /* 引用：先 flush 其它块，再累积引用行 */
      flushBlockquote();
      flushUnorderedList();
      flushOrderedList();
      flushParagraph();
      blockquoteLines.push(line.slice(2));
      continue;
    }

    if (UNORDERED_LIST_PREFIX.test(line)) {
      flushBlockquote();
      flushOrderedList();
      flushParagraph();
      ulItems.push(line.replace(UNORDERED_LIST_PREFIX, '').trim());
      continue;
    }

    if (ORDERED_LIST_PREFIX.test(line)) {
      /* 有序列表：同上，累积 ol 项 */
      flushBlockquote();
      flushUnorderedList();
      flushParagraph();
      olItems.push(line.replace(ORDERED_LIST_PREFIX, '').trim());
      continue;
    }

    flushBlockquote();
    flushUnorderedList();
    flushOrderedList();
    paragraphLines.push(line); /* 普通段落行 */
  }

  flushBlockquote();
  flushUnorderedList();
  flushOrderedList();
  flushParagraph();

  return result.length > 0 ? result : null;
}

/** [显示文本](url) 链接格式 */
const LINK_REGEX = /\[([^\]]*)\]\(([^)]*)\)/g;

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

/** 在无行内代码的片段内解析 [text](url)，并处理 **粗体** / *斜体* */
function parseSegmentWithLinks(segment: string, keyBase: number): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let keyIdx = keyBase;

  LINK_REGEX.lastIndex = 0;
  let match;

  while ((match = LINK_REGEX.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        formatInlineBoldItalic(segment.slice(lastIndex), `seg-${keyIdx++}`)
      );
    }
    const [, text, url] = match;
    if (isSafeHref(url)) {
      parts.push(
        <a key={`link-${keyIdx++}`} href={url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      );
    } else {
      parts.push(match[0]); /* 不安全协议保留原文，不渲染为链接 */
    }
    lastIndex = match.index + match[0].length;
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

/** **粗体** 与 *斜体*（避免 *** 被拆散） */
function formatInlineBoldItalic(text: string, key: string): ReactNode {
  let result = text;
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  if (result.includes('<strong>') || result.includes('<em>')) {
    return <span key={key} dangerouslySetInnerHTML={{ __html: result }} />;
  }
  return result;
}

export default MessageContent;
  