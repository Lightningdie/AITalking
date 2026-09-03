/**
 * SSE 流式消息演示服务器 - 主入口
 * 
 * 模块结构：
 * - config/   配置文件
 * - utils/    工具函数
 * - services/ 业务服务
 * - routes/   路由处理
 */
const http = require('http');
const { PORT } = require('./config');
const { handleCORS } = require('./utils');
const {
  handleStaticRoutes,
  handleChatProxy,
  handleSSE,
  handlePause,
  handleResume,
  handleListConversations,
  handleSaveConversation,
  handleGetConversation,
  handleDeleteConversation
} = require('./routes');
const { initDatabase } = require('./services/database');

/**
 * 创建 HTTP 服务器
 */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;
  
  // CORS 预检请求
  if (method === 'OPTIONS') {
    handleCORS(res);
    return;
  }
  
  // 静态文件路由
  if (handleStaticRoutes(url, res)) {
    return;
  }
  
  // AI 聊天代理
  if (pathname === '/api/chat' && method === 'POST') {
    handleChatProxy(req, res);
    return;
  }

  // 对话历史记录
  if (pathname === '/api/conversations' && method === 'GET') {
    handleListConversations(res);
    return;
  }

  if (pathname === '/api/conversations' && method === 'POST') {
    handleSaveConversation(req, res);
    return;
  }

  const conversationMatch = pathname.match(/^\/api\/conversations\/([\w-]+)$/);
  if (conversationMatch) {
    const id = conversationMatch[1];
    if (method === 'GET') {
      handleGetConversation(id, res);
    } else if (method === 'DELETE') {
      handleDeleteConversation(id, res);
    } else {
      res.writeHead(405);
      res.end('Method Not Allowed');
    }
    return;
  }

  // SSE 打字机演示
  if (pathname === '/sse') {
    handleSSE(url, req, res);
    return;
  }
  
  // 暂停控制
  if (pathname === '/pause' && method === 'POST') {
    handlePause(url, res);
    return;
  }
  
  // 继续控制
  if (pathname === '/resume' && method === 'POST') {
    handleResume(url, res);
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

/**
 * 启动服务器（先初始化数据库）
 */
initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════╗
║   🚀 SSE Typewriter Demo Server Running!       ║
║                                                ║
║   Open in browser: http://localhost:${PORT}       ║
╚════════════════════════════════════════════════╝
  `);
    });
  })
  .catch((error) => {
    console.error('Database init failed:', error);
    process.exit(1);
  });

module.exports = server;
