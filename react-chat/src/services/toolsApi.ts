/**
 * AI 工具 API：文档导出
 */

export interface DocumentResult {
  fileName: string;
  url: string;
}

/** 把回复内容导出为 docx / xlsx / md 文件 */
export async function exportDocument(options: {
  type: 'docx' | 'xlsx' | 'md';
  title: string;
  markdown: string;
}): Promise<DocumentResult> {
  const res = await fetch('/api/tools/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `导出失败: HTTP ${res.status}`);
  }
  return res.json() as Promise<DocumentResult>;
}
