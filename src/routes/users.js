const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDb } = require('../models/db');

const createUserSchema = z.object({
  name: z.string().min(1, 'name is required'),
  email: z.string().min(1, 'email is required').email('email must be a valid email address'),
});

// GET /api/users
router.get('/', (req, res) => {
  const pageNum = parseInt(req.query.page, 10);
  const limitNum = parseInt(req.query.limit, 10);

  if (
    (req.query.page !== undefined && (isNaN(pageNum) || pageNum < 1)) ||
    (req.query.limit !== undefined && (isNaN(limitNum) || limitNum < 1))
  ) {
    return res.status(400).json({ error: 'page and limit must be positive integers' });
  }

  const page = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
  const limit = isNaN(limitNum) || limitNum < 1 ? 20 : limitNum;

  const total = getDb().prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const offset = (page - 1) * limit;
  const users = getDb().prepare(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);

  res.json({
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
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
