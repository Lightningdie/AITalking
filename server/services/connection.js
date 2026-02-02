/**
 * SSE 连接状态管理服务
 */

// 存储所有活跃的 SSE 连接
const connections = new Map();
let connectionIdCounter = 0;

/**
 * 生成新的连接 ID
 * @returns {string} 连接 ID
 */
function generateConnectionId() {
  return String(++connectionIdCounter);
}

/**
 * 创建新连接
 * @param {string} connectionId - 连接 ID
 * @param {Object} state - 连接状态对象
 */
function createConnection(connectionId, state) {
  connections.set(connectionId, state);
  console.log(`New connection: ${connectionId}`);
}

/**
 * 获取连接
 * @param {string} connectionId - 连接 ID
 * @returns {Object|undefined} 连接状态对象
 */
function getConnection(connectionId) {
  return connections.get(connectionId);
}

/**
 * 删除连接
 * @param {string} connectionId - 连接 ID
 */
function removeConnection(connectionId) {
  connections.delete(connectionId);
  console.log(`Connection ${connectionId} removed`);
}

/**
 * 暂停连接
 * @param {string} connectionId - 连接 ID
 * @returns {boolean} 是否成功
 */
function pauseConnection(connectionId) {
  const conn = connections.get(connectionId);
  if (conn) {
    conn.isPaused = true;
    console.log(`Connection ${connectionId} paused`);
    return true;
  }
  return false;
}

/**
 * 恢复连接
 * @param {string} connectionId - 连接 ID
 * @returns {boolean} 是否成功
 */
function resumeConnection(connectionId) {
  const conn = connections.get(connectionId);
  if (conn) {
    conn.isPaused = false;
    console.log(`Connection ${connectionId} resumed`);
    return true;
  }
  return false;
}

/**
 * 获取所有连接数量
 * @returns {number} 连接数量
 */
function getConnectionCount() {
  return connections.size;
}

module.exports = {
  generateConnectionId,
  createConnection,
  getConnection,
  removeConnection,
  pauseConnection,
  resumeConnection,
  getConnectionCount
};
