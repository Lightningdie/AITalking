/**
 * AI API 配置
 */
const API_CONFIG = {
  zhipu: {
    name: '智谱',
    hostname: 'open.bigmodel.cn',
    path: '/api/paas/v4/chat/completions',
    defaultModel: 'glm-4.5-flash'
  },
  spark: {
    name: '讯飞星火',
    hostname: 'spark-api-open.xf-yun.com',
    path: '/v1/chat/completions',
    defaultModel: 'lite'
  }
};

module.exports = API_CONFIG;
