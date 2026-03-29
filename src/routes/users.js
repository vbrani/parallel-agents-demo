const express = require('express');
const router = express.Router();
const { getDb } = require('../models/db');

// GET /api/users
router.get('/', (req, res) => {
  const users = getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST /api/users
router.post('/', (req, res) => {
  const { name, email } = req.body;

  // BUG: No validation - can create user with empty name/email
  const result = getDb().prepare(
    'INSERT INTO users (name, email) VALUES (?, ?)'
  ).run(name, email);

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

// GET /api/users/:id/tasks
router.get('/:id/tasks', (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const tasks = getDb().prepare('SELECT * FROM tasks WHERE assigned_to = ?').all(req.params.id);
  res.json(tasks);
});

module.exports = router;
