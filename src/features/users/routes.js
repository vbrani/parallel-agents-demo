const express = require('express');
const router = express.Router();
const { getDb } = require('../../shared/db');
const { createUserSchema, notifyUserSchema } = require('./validation');
const { parsePagination, paginatedResponse } = require('../../shared/pagination');
const { sendNotification } = require('./notifications');

// GET /api/users
router.get('/', (req, res) => {
  const pagination = parsePagination(req, res);
  if (!pagination.valid) return;
  const { page, limit } = pagination;

  const total = getDb().prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const offset = (page - 1) * limit;
  const users = getDb()
    .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset);

  res.json(paginatedResponse(users, page, limit, total));
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST /api/users
router.post('/', (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { name, email } = parsed.data;
  const result = getDb()
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .run(name, email);

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

// POST /api/users/:id/notify
router.post('/:id/notify', (req, res) => {
  const parsed = notifyUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { subject, message } = parsed.data;
  const result = sendNotification(user.email, subject, message);
  res.json(result);
});

// GET /api/users/:id/tasks
router.get('/:id/tasks', (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const tasks = getDb()
    .prepare('SELECT * FROM tasks WHERE assigned_to = ?')
    .all(req.params.id);
  res.json(tasks);
});

module.exports = router;
