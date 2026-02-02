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

function parseContent(text: string): ReactNode[] | ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
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

function formatInlineText(text: string): ReactNode[] | ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const result: ReactNode[] = [];
  let inBlockquote = false;
  let blockquoteContent: string[] = [];
  let keyIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('> ')) {
      inBlockquote = true;
      blockquoteContent.push(line.slice(2));
    } else {
      if (inBlockquote) {
        result.push(
          <blockquote key={`bq-${keyIndex++}`} className="blockquote">
            {blockquoteContent.join('\n')}
          </blockquote>
        );
        blockquoteContent = [];
        inBlockquote = false;
      }

      if (line) {
        result.push(
          <span key={`line-${keyIndex++}`}>
            {formatLine(line)}
            {i < lines.length - 1 && <br />}
          </span>
        );
      } else if (i < lines.length - 1) {
        result.push(<br key={`br-${keyIndex++}`} />);
      }
    }
  }

  if (inBlockquote && blockquoteContent.length > 0) {
    result.push(
      <blockquote key="bq-end" className="blockquote">
        {blockquoteContent.join('\n')}
      </blockquote>
    );
  }

  return result;
}

function formatLine(line: string): ReactNode {
  const elements: ReactNode[] = [];
  let lastIndex = 0;
  let keyIdx = 0;

  const codeRegex = /`([^`]+)`/g;
  let match;

  while ((match = codeRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      elements.push(line.slice(lastIndex, match.index));
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
      elements.push(line.slice(lastIndex));
    }
    return elements;
  }

  let result = line;
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, p1) => `<strong>${p1}</strong>`);
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, p1) => `<em>${p1}</em>`);

  if (result.includes('<strong>') || result.includes('<em>')) {
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  }

  return result;
}

export default MessageContent;
