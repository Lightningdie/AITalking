/**
 * 对话记录数据库服务（SQLite，通过 sql.js 实现，落盘为标准 .db 文件）
 * 存储位置：D:\talkingLog\db\chat.db
 */
const fs = require('fs');
const initSqlJs = require('sql.js');
const { DB_DIR, DB_FILE } = require('../config/storage.config');

/** @type {import('sql.js').Database | null} */
let db = null;

/**
 * 初始化数据库（加载 wasm、读取已有文件、建表）
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  fs.mkdirSync(DB_DIR, { recursive: true });

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoning_content TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);

  // 旧库迁移：messages 补充 images 列（存多模态图片 data URL 数组的 JSON）
  try {
    db.run('ALTER TABLE messages ADD COLUMN images TEXT');
  } catch (e) {
    // 列已存在则忽略
  }

  persist();
  console.log(`[database] ready at ${DB_FILE}`);
}

/**
 * 将内存数据库落盘
 */
function persist() {
  if (!db) return;
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * 保存（新增或覆盖）一个对话及其全部消息
 * @param {Object} payload
 * @param {string} payload.id
 * @param {string} payload.title
 * @param {string} [payload.provider]
 * @param {string} [payload.model]
 * @param {Array<{id:string, role:string, content:string, reasoningContent?:string, createdAt?:number}>} payload.messages
 */
function saveConversation({ id, title, provider, model, messages }) {
  const now = Date.now();
  const existing = all('SELECT created_at FROM conversations WHERE id = ?', [id]);
  const createdAt = existing.length ? existing[0].created_at : now;

  db.run('INSERT OR REPLACE INTO conversations (id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    title,
    provider || '',
    model || '',
    createdAt,
    now
  ]);

  db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
  for (const msg of messages) {
    db.run('INSERT INTO messages (id, conversation_id, role, content, reasoning_content, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      msg.id,
      id,
      msg.role,
      msg.content || '',
      msg.reasoningContent || null,
      Array.isArray(msg.images) && msg.images.length ? JSON.stringify(msg.images) : null,
      msg.createdAt || now
    ]);
  }

  persist();
  return { id, createdAt, updatedAt: now };
}

/**
 * 对话列表（含消息条数），按更新时间倒序
 */
function listConversations() {
  return all(`
    SELECT c.id, c.title, c.provider, c.model, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c
    ORDER BY c.updated_at DESC
  `);
}

/**
 * 获取单个对话及其消息
 */
function getConversation(id) {
  const conversations = all('SELECT * FROM conversations WHERE id = ?', [id]);
  if (conversations.length === 0) return null;
  const messages = all(
    'SELECT id, role, content, reasoning_content, images, created_at FROM messages WHERE conversation_id = ? ORDER BY rowid',
    [id]
  ).map((row) => {
    let images = null;
    if (row.images) {
      try { images = JSON.parse(row.images); } catch (e) { images = null; }
    }
    return { ...row, images };
  });
  return { conversation: conversations[0], messages };
}

/**
 * 删除对话及其消息
 */
function deleteConversation(id) {
  db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
  const result = db.run('DELETE FROM conversations WHERE id = ?', [id]);
  persist();
  return result;
}

module.exports = {
  initDatabase,
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation
};
