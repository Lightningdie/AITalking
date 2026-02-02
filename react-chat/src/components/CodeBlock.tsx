import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';

export interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language = '' }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current && code) {
      codeRef.current.removeAttribute('data-highlighted');

      if (language) {
        try {
          const result = hljs.highlight(code, { language });
          codeRef.current.innerHTML = result.value;
        } catch {
          hljs.highlightElement(codeRef.current);
        }
      } else {
        hljs.highlightElement(codeRef.current);
      }
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__language">{language || 'code'}</span>
        <button
          className={`code-block__copy ${copied ? 'code-block__copy--copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <div className="code-block__content">
        <pre>
          <code ref={codeRef} className={language ? `language-${language}` : ''}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

export default CodeBlock;
