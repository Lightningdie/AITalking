/**
 * 上下文拼装管线（【预留骨架，未实施】）
 *
 * designDoc/后端上下文拼装改造设计文档.md §4.1 —— Agent Harness 的前置依赖：
 * 服务端成为对话状态的唯一权威来源，前端只发增量。
 *
 * 管线：loadHistory → sanitize → budget(+summarize) → assemble
 *   - loadHistory  从 DB 加载会话历史
 *   - sanitize     清洗（role 校验 / 合并相邻同角色 / 剥离空消息；
 *                  harness 落地后需放行 role:'tool'，且保证 tool 消息
 *                  紧跟其所属 assistant 消息不被裁剪拆散）
 *   - budget       token 预算裁剪（从最新往旧累加的滑动窗口，窗口头部 summary 始终保留）
 *   - summarize    摘要压缩（P2，预留接口）
 *   - assemble     注入 system（深度思考提示词）+ 拼装最终 messages
 *
 * 返回：{ messages, droppedCount, estimatedTokens }
 * 消费方：routes/chat.js（增量聊天端点）、services/agent.js（agentic loop 每步回填后再拼装）。
 */
'use strict';

// TODO(上下文拼装 P0-1/P1-2): 实现 loadHistory / sanitize / budget / summarize / assemble
module.exports = {
  // assemble,
};
