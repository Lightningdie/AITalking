/**
 * Milkdown 只读 Markdown 渲染器
 * 呈现回复的富文本（表格/任务列表/高亮代码块等）；content 变化时增量替换文档，
 * 因此流式阶段也能实时预览 Markdown 渲染效果
 */
import { useEffect, useRef } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx
} from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { prism, prismConfig } from '@milkdown/plugin-prism';
// 提供基础 ProseMirror 样式（gapcursor 等）
import '@milkdown/kit/prose/view/style/prosemirror.css';

export interface MilkdownViewProps {
  content: string;
}

/** 两次文档替换的最小间隔（ms），避免逐 chunk 全量重解析造成卡顿 */
const UPDATE_INTERVAL = 150;

const MilkdownEditor = ({ content }: MilkdownViewProps) => {
  const { loading, get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, content);
          // 只读 + 自定义样式类
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => false,
            attributes: { class: 'chat-prose' }
          }));
          // 围栏语言别名映射（refractor 语言 id 与常见 fence 标记不同）
          ctx.update(prismConfig.key, (prev) => ({
            ...prev,
            configureRefractor: (refractor) => {
              refractor.alias('js', 'javascript');
              refractor.alias('ts', 'typescript');
              refractor.alias('py', 'python');
              refractor.alias({ sh: 'bash', shell: 'bash' });
              refractor.alias('yml', 'yaml');
              refractor.alias('html', 'markup');
              return refractor;
            }
          }));
        })
        .use(commonmark)
        .use(gfm)
        .use(prism),
    []
  );

  // content 变化 → 整体替换编辑器文档（节流 + 尾帧兜底，保证最终内容一定被应用）
  const lastApplyRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    const editor = get();
    if (!editor) return;

    const apply = () => {
      lastApplyRef.current = Date.now();
      editor.action(replaceAll(content));
    };

    const elapsed = Date.now() - lastApplyRef.current;
    if (elapsed >= UPDATE_INTERVAL) {
      apply();
      return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(apply, UPDATE_INTERVAL - elapsed);
    return () => window.clearTimeout(timerRef.current);
  }, [content, loading, get]);

  return <Milkdown />;
};

export function MilkdownView({ content }: MilkdownViewProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditor content={content} />
    </MilkdownProvider>
  );
}

export default MilkdownView;
