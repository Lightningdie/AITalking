/**
 * Agent 最小闭环验证脚本
 *
 * 用法：
 *   node server/scripts/agent-loop-demo.js --mock
 *     离线验证：脚本化上游（第一次返回 tool_calls，第二次返回最终回答），
 *     跑通「用户请求 → 模型调工具 → 结果回填 → 模型回答」，并断言
 *     messages 配对与 tool_call_id 正确。工具真实执行（filegen 落盘文件）。
 *
 *   AITALKING_API_KEY=<key> node server/scripts/agent-loop-demo.js --live "把下面的表格导出成xlsx：..."
 *     真实上游联调（api.config.js 指向的智谱兼容端点）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { runAgent } = require('../services/agent');
const { FILES_DIR } = require('../services/filegen');

/** 用户请求：要求导出表格 */
const MOCK_USER_CONTENT = [
  '请把下面的表格导出成 xlsx 文件：',
  '',
  '| 商品 | 销量 |',
  '| --- | --- |',
  '| A | 120 |',
  '| B | 87 |'
].join('\n');

/**
 * 脚本化上游：模拟「先要工具、再给回答」的两步行为，
 * 签名与 llmproxy.callUpstream 一致，经 runAgent 的 call 参数注入。
 */
function createMockUpstream() {
  let callCount = 0;
  return async ({ messages }) => {
    callCount += 1;
    console.log(`\n----- mock upstream 第 ${callCount} 次调用（context ${messages.length} 条）-----`);

    if (callCount === 1) {
      return {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_mock_001',
              type: 'function',
              function: {
                name: 'generate_document',
                arguments: JSON.stringify({
                  type: 'xlsx',
                  title: '季度销量',
                  markdown: MOCK_USER_CONTENT
                })
              }
            }
          ]
        },
        finishReason: 'tool_calls',
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      };
    }

    // 第二次：看到 tool 结果后给出最终回答
    const toolMsg = messages.find((m) => m.role === 'tool');
    const toolResult = toolMsg ? JSON.parse(toolMsg.content) : {};
    return {
      message: {
        role: 'assistant',
        content: `已完成导出：${toolResult.fileName}，下载地址 ${toolResult.url}。`
      },
      finishReason: 'stop',
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 }
    };
  };
}

/** 校验 messages 配对：每个 role:'tool' 的前一条必须是包含对应 tool_call_id 的 assistant 消息 */
function assertMessagePairing(messages) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'tool') continue;

    const prev = messages[i - 1];
    if (!prev || prev.role !== 'assistant' || !Array.isArray(prev.tool_calls)) {
      throw new Error(`配对错误：messages[${i}] 的 tool 消息前面不是带 tool_calls 的 assistant 消息`);
    }
    if (!prev.tool_calls.some((tc) => tc.id === msg.tool_call_id)) {
      throw new Error(
        `配对错误：messages[${i}] 的 tool_call_id=${msg.tool_call_id} 在前一条 assistant.tool_calls 中不存在`
      );
    }
  }
}

async function main() {
  const mode = process.argv[2] || '--mock';

  const messages = [{ role: 'user', content: MOCK_USER_CONTENT }];

  let currentStep = 0;
  const result = await runAgent({
    apiKey: process.env.AITALKING_API_KEY || process.argv[3] || 'mock-key',
    model: 'glm-5.3-flash',
    messages,
    maxSteps: 2,
    stream: false,
    call: mode === '--mock' ? createMockUpstream() : undefined,
    onEvent: (event) => {
      if (event.type === 'step') {
        currentStep = event.step;
      } else if (event.type === 'toolCall') {
        console.log(`🔧 [step ${currentStep}] toolCall: ${event.name} args=${event.argsSummary}`);
      } else if (event.type === 'toolResult') {
        console.log(`${event.ok ? '✅' : '❌'} toolResult: ${event.name} → ${event.summary}`);
      }
    }
  });

  console.log('\n===== 循环结束 =====');
  console.log(`步数: ${result.stepsUsed}，最终回答: ${result.content}`);

  if (mode !== '--mock') {
    return;
  }

  // ---- mock 模式断言 ----
  const failures = [];
  try {
    assertMessagePairing(messages);
    console.log('✅ 断言通过：assistant(tool_calls) 与 role:tool 消息成对、tool_call_id 对应');
  } catch (e) {
    failures.push(e.message);
  }

  const docCall = result.toolCalls[0];
  if (docCall && docCall.result && docCall.result.ok && docCall.result.fileName) {
    const filePath = path.join(FILES_DIR, docCall.result.fileName);
    if (fs.existsSync(filePath)) {
      console.log(`✅ 断言通过：文件已真实落盘 ${filePath}`);
    } else {
      failures.push(`文件未落盘: ${filePath}`);
    }
  } else {
    failures.push('工具结果不是 ok:true（registry/filegen 链路异常）');
  }

  if (!result.content.includes(docCall?.result?.fileName || '')) {
    failures.push('最终回答未包含工具产物文件名（模型上下文回填可能断裂）');
  } else {
    console.log('✅ 断言通过：最终回答引用了工具结果（role:tool 回填生效）');
  }

  if (failures.length) {
    console.error(`\n❌ ${failures.length} 项断言失败:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('\n🎉 最小闭环验证全部通过');
}

main().catch((error) => {
  console.error('运行失败:', error.message);
  process.exit(1);
});
