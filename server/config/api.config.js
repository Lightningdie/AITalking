/**
 * AI API 配置
 */
const API_CONFIG = {
  zhipu: {
    name: '智谱',
    protocol: 'http',
    hostname: '172.16.23.95',
    port: 3000,
    path: '/v1/chat/completions',
    defaultModel: 'glm-5.3-flash'
  }
};

module.exports = API_CONFIG;
