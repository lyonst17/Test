const express = require('express');
const router = express.Router();
const db = require('../db');

// List all chats for the authenticated user
router.get('/', (req, res) => {
  const chats = db.getUserChats(req.session.user.id);
  res.json(chats);
});

// Create a new chat
router.post('/', (req, res) => {
  const { title, provider, model } = req.body;
  const id = db.createChat(req.session.user.id, title, provider, model);
  res.json({ id });
});

// Get a specific chat with messages
router.get('/:id', (req, res) => {
  const chat = db.getChatMessages(req.params.id, req.session.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

// Add a message to a chat
router.post('/:id/messages', (req, res) => {
  const { role, content, attachments } = req.body;
  const ok = db.addMessage(req.params.id, req.session.user.id, role, content, attachments);
  if (!ok) return res.status(404).json({ error: 'Chat not found' });
  res.json({ ok: true });
});

// Update chat title
router.patch('/:id', (req, res) => {
  const { title, provider, model } = req.body;
  if (title) {
    db.updateChatTitle(req.params.id, req.session.user.id, title);
  }
  if (provider || model) {
    db.updateChatMeta(req.params.id, req.session.user.id, provider, model);
  }
  res.json({ ok: true });
});

// Delete a chat
router.delete('/:id', (req, res) => {
  const ok = db.deleteChat(req.params.id, req.session.user.id);
  if (!ok) return res.status(404).json({ error: 'Chat not found' });
  res.json({ ok: true });
});

module.exports = router;
