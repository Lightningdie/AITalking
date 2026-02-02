/**
 * HTTP 请求工具函数
 */

/**
 * 读取 POST 请求体并解析为 JSON
 * @param {Object} req - HTTP 请求对象
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 解析 URL 参数
 * @param {URL} url - URL 对象
 * @param {string} key - 参数名
 * @param {*} defaultValue - 默认值
 * @returns {string|*} 参数值或默认值
 */
function getQueryParam(url, key, defaultValue = null) {
  const value = url.searchParams.get(key);
  return value !== null ? value : defaultValue;
}

/**
 * 解析 URL 参数为整数
 * @param {URL} url - URL 对象
 * @param {string} key - 参数名
 * @param {number} defaultValue - 默认值
 * @returns {number} 参数值或默认值
 */
function getQueryParamInt(url, key, defaultValue = 0) {
  const value = url.searchParams.get(key);
  return value !== null ? parseInt(value, 10) : defaultValue;
}

module.exports = {
  readBody,
  getQueryParam,
  getQueryParamInt
};
