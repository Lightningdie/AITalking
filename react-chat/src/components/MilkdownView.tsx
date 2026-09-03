/**
 * Milkdown 只读 Markdown 渲染器
 * 用于呈现已完成回复的富文本（表格/任务列表/高亮代码块等）
 */
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { prism, prismConfig } from '@milkdown/plugin-prism';
// 提供基础 ProseMirror 样式（gapcursor 等）
import '@milkdown/kit/prose/view/style/prosemirror.css';

export interface MilkdownViewProps {
  content: string;
}

const MilkdownEditor = ({ content }: MilkdownViewProps) => {
  useEditor(
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
    // 内容在挂载后不再变化（流式阶段走轻量渲染器）
    []
  );

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
