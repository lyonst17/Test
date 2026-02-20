const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'chats.db');

let db = null;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      provider TEXT,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id ASC);
  `);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createChat(userId, title, provider, model) {
  const id = generateId();
  getDb()
    .prepare('INSERT INTO chats (id, user_id, title, provider, model) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, title || 'New Chat', provider || null, model || null);
  return id;
}

function getUserChats(userId) {
  return getDb()
    .prepare(
      `SELECT id, title, provider, model, created_at, updated_at
       FROM chats WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId);
}

function getChat(chatId, userId) {
  return getDb()
    .prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
    .get(chatId, userId);
}

function getChatMessages(chatId, userId) {
  const chat = getChat(chatId, userId);
  if (!chat) return null;
  const messages = getDb()
    .prepare('SELECT role, content, attachments, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC')
    .all(chatId);
  return {
    ...chat,
    messages: messages.map((m) => ({
      ...m,
      attachments: m.attachments ? JSON.parse(m.attachments) : null,
    })),
  };
}

function addMessage(chatId, userId, role, content, attachments) {
  const chat = getChat(chatId, userId);
  if (!chat) return null;
  const attachJson = attachments ? JSON.stringify(attachments) : null;
  getDb()
    .prepare('INSERT INTO messages (chat_id, role, content, attachments) VALUES (?, ?, ?, ?)')
    .run(chatId, role, content, attachJson);
  getDb()
    .prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?")
    .run(chatId);
  return true;
}

function updateChatTitle(chatId, userId, title) {
  const result = getDb()
    .prepare('UPDATE chats SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, chatId, userId);
  return result.changes > 0;
}

function updateChatMeta(chatId, userId, provider, model) {
  const result = getDb()
    .prepare('UPDATE chats SET provider = ?, model = ? WHERE id = ? AND user_id = ?')
    .run(provider, model, chatId, userId);
  return result.changes > 0;
}

function deleteChat(chatId, userId) {
  const result = getDb()
    .prepare('DELETE FROM chats WHERE id = ? AND user_id = ?')
    .run(chatId, userId);
  return result.changes > 0;
}

module.exports = {
  createChat,
  getUserChats,
  getChat,
  getChatMessages,
  addMessage,
  updateChatTitle,
  updateChatMeta,
  deleteChat,
};
