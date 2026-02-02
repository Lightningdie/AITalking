/**
 * 静态文件路由
 */
const path = require('path');
const { serveStaticFile } = require('../utils/response');

// 项目根目录
const ROOT_DIR = path.join(__dirname, '../..');

/**
 * 处理静态文件请求
 * @param {URL} url - 请求 URL
 * @param {Object} res - HTTP 响应对象
 * @returns {boolean} 是否已处理该请求
 */
function handleStaticRoutes(url, res) {
  const pathname = url.pathname;
  
  // 首页（SSE 演示）
  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile(path.join(ROOT_DIR, 'index.html'), res);
    return true;
  }
  
  // CSS 文件
  if (pathname.startsWith('/css/')) {
    serveStaticFile(path.join(ROOT_DIR, pathname), res);
    return true;
  }
  
  // JS 文件
  if (pathname.startsWith('/js/')) {
    serveStaticFile(path.join(ROOT_DIR, pathname), res);
    return true;
  }
  
  return false;
}

module.exports = {
  handleStaticRoutes
};
