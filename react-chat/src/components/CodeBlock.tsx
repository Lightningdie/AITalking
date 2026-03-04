import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';

export interface CodeBlockProps {
  code: string;
  language?: string;
}

/** 代码块展示与复制；使用 highlight.js 高亮，仅接收已闭合的代码块内容 */
export function CodeBlock({ code, language = '' }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  /* 仅闭合的 ```...``` 会进入本组件。空代码不调 hljs；hljs 异常时回退纯文本并保留 hljs 类，避免流式/高亮报错 */
  useEffect(() => {
    if (!codeRef.current) return;
    codeRef.current.removeAttribute('data-highlighted');
    if (!code.trim()) {
      codeRef.current.textContent = '';
      return;
    }
    try {
      if (language) {
        const result = hljs.highlight(code, { language });
        codeRef.current.innerHTML = result.value;
        codeRef.current.classList.add('hljs');
      } else {
        hljs.highlightElement(codeRef.current);
      }
    } catch {
      codeRef.current.textContent = code;
      codeRef.current.classList.add('hljs');
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
          <code
            ref={codeRef}
            className={language ? `language-${language} hljs` : 'hljs'}
          >
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

export default CodeBlock;
