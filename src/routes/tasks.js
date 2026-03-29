const express = require('express');
const router = express.Router();
const { getDb } = require('../models/db');

// GET /api/tasks - List all tasks
router.get('/', (req, res) => {
  const { status, priority, assigned_to } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (priority) {
    query += ' AND priority = ?';
    params.push(priority);
  }
  if (assigned_to) {
    query += ' AND assigned_to = ?';
    params.push(assigned_to);
  }

  query += ' ORDER BY created_at DESC';
  const tasks = getDb().prepare(query).all(...params);
  res.json(tasks);
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, description, status, priority, assigned_to } = req.body;

  // BUG: No input validation at all!
  const result = getDb().prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description, status || 'todo', priority || 'medium', assigned_to);

  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const { title, description, status, priority, assigned_to } = req.body;
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  // BUG: updated_at is never actually updated
  getDb().prepare(
    'UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assigned_to = ? WHERE id = ?'
  ).run(
    title || existing.title,
    description || existing.description,
    status || existing.status,
    priority || existing.priority,
    assigned_to || existing.assigned_to,
    req.params.id
  );

  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json(task);
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

module.exports = router;
