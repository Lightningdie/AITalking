/**
 * Agent Harness 内核 —— agentic loop（P1-3）
 *
 * designDoc/AgentHarness能力建设设计文档.md §4.3：
 * 包裹模型的执行回路——把工具清单注入请求 → 解析模型的工具调用请求 →
 * 经工具注册表执行 → 结果以 role:'tool' 回填 → 再次调用上游 → 循环，
 * 直到模型产出最终回答或达到步数上限。
 *
 * 用法：
 *   const result = await runAgent({
 *     apiKey, model, config,             // 上游鉴权与地址（API_CONFIG[provider]）
 *     messages,                          // OpenAI 格式上下文（含最新 user 消息），会被原地扩展
 *     maxSteps,                          // 默认 2（最小闭环验证），硬上限 8
 *     stream,                            // true=流式（onDelta 经 onEvent 增量回调），false=整包
 *     onEvent,                           // (event) => void，事件见下
 *     isCancelled,                       // () => boolean，客户端断开时中止循环
 *     setCurrent,                        // 暴露当前上游请求供外部 destroy
 *     call                               // 注入自定义上游调用（测试/mock 用）
 *   });
 *
 * 事件（onEvent 收到）：step / delta / toolCall / toolResult，与 SSE 协议对应。
 * 返回：{ content, reasoning, toolCalls, usage, steps, messages }
 *
 * 前置依赖：services/context.js（后端上下文拼装）落地前，messages 由调用方
 * （前端窗口或 console 脚本）提供；落地后改由 context.assemble 生成。
 */
'use strict';

const API_CONFIG = require('../config/api.config');
const registry = require('./tools/registry');
const { callUpstream, streamUpstream } = require('./llmproxy');

/** 最小闭环验证用默认步数；设计文档目标值为 8 */
const DEFAULT_MAX_STEPS = 2;
/** 硬上限：防止"工具结果诱发再调用"的死循环（设计文档 §5） */
const HARD_MAX_STEPS = 8;

/** 事件摘要的截断长度 */
const SUMMARY_MAX_CHARS = 120;

/**
 * 运行 agent 循环（见文件头注释）
 */
async function runAgent({
  apiKey,
  model,
  config,
  provider = 'zhipu',
  messages,
  tools,
  reasoningEffort,
  maxTokens,
  maxSteps = DEFAULT_MAX_STEPS,
  stream = false,
  onEvent,
  isCancelled,
  setCurrent,
  call
} = {}) {
  const providerConfig = config || API_CONFIG[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  if (!apiKey) {
    throw new Error('API Key is required');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array is required');
  }

  const steps = Math.min(Math.max(1, Math.floor(maxSteps) || DEFAULT_MAX_STEPS), HARD_MAX_STEPS);
  const apiTools = tools !== undefined ? tools : registry.toApiTools();
  const invoke = call || (stream ? streamUpstream : callUpstream);
  const cancelled = () => !!(isCancelled && isCancelled());

  /** 过程收集（返回给调用方，供前端展示/落库） */
  const collected = { toolCalls: [], usage: null, stepsUsed: 0 };
  let finalContent = '';
  let finalReasoning = '';
  let answered = false;

  for (let step = 1; step <= steps && !answered && !cancelled(); step++) {
    collected.stepsUsed = step;
    onEvent?.({ type: 'step', step, maxSteps: steps });

    const { message, finishReason, usage } = await invoke({
      apiKey,
      model: model || providerConfig.defaultModel,
      config: providerConfig,
      messages,
      tools: apiTools,
      reasoningEffort,
      maxTokens,
      onDelta: (d) => onEvent?.({ type: 'delta', ...d }),
      setCurrent
    });
    if (usage) collected.usage = usage;

    const toolCalls = message.tool_calls || [];

    // ---- 模型请求调用工具 → 执行 → 回填 → 继续循环 ----
    if (finishReason === 'tool_calls' || toolCalls.length > 0) {
      // assistant 消息（含 tool_calls）必须先入列，tool 结果紧随其后（成对）。
      // reasoning_content 属于展示层信息，不回灌上下文（避免上游拒绝非标准字段）。
      const { reasoning_content, ...contextMessage } = message;
      messages.push(contextMessage);

      for (const tc of toolCalls) {
        if (cancelled()) break;

        const name = tc.function?.name || '';
        let args = null;
        let parseError = null;
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch (e) {
          parseError = `工具参数不是合法 JSON: ${e.message}`;
        }

        onEvent?.({
          type: 'toolCall',
          id: tc.id,
          name,
          argsSummary: parseError || summarize(args)
        });

        const result = parseError
          ? { ok: false, error: parseError }
          : await registry.execute(name, args);

        onEvent?.({
          type: 'toolResult',
          id: tc.id,
          name,
          ok: result?.ok !== false,
          summary: summarizeResult(result),
          url: result?.ok ? result.url : undefined
        });

        collected.toolCalls.push({ id: tc.id, name, args, result });

        // 结果以 role:'tool' 回填，tool_call_id 与请求一一对应
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }
      continue; // 回循环：模型看到工具结果后决定下一步
    }

    // ---- 最终回答（finish_reason === 'stop'）----
    answered = true;
    finalContent = message.content || '';
    finalReasoning = message.reasoning_content || '';
    messages.push({ role: 'assistant', content: finalContent });
  }

  // ---- 边界：步数耗尽仍无最终回答（设计文档 §5）----
  if (!answered) {
    finalContent =
      finalContent ||
      `⚠️ 已达到工具调用上限（${steps} 步），本轮未生成最终回答，请缩小任务后重试。`;
    // 流式模式下该提示未经过增量下发，补发一条 delta 让前端可见
    if (stream) onEvent?.({ type: 'delta', content: finalContent });
    messages.push({ role: 'assistant', content: finalContent });
  }

  return {
    content: finalContent,
    reasoning: finalReasoning,
    toolCalls: collected.toolCalls,
    usage: collected.usage,
    stepsUsed: collected.stepsUsed,
    messages
  };
}

/** 参数摘要（事件用，截断防刷屏） */
function summarize(args) {
  const text = JSON.stringify(args ?? {});
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}…` : text;
}

/** 结果摘要（事件用）：突出文件名/链接/错误，其余截断 */
function summarizeResult(result) {
  if (!result) return '（空结果）';
  if (result.ok === false) return result.error || '执行失败';
  if (result.fileName) return `已生成 ${result.fileName}`;
  const text = JSON.stringify(result);
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}…` : text;
}

module.exports = {
  runAgent,
  DEFAULT_MAX_STEPS,
  HARD_MAX_STEPS
};
