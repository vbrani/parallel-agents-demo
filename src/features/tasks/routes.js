const express = require('express');
const router = express.Router();
const { getDb } = require('../../shared/db');
const { createTaskSchema } = require('./validation');
const { parsePagination, paginatedResponse } = require('../../shared/pagination');

// GET /api/tasks - List all tasks with optional filters
router.get('/', (req, res) => {
  const pagination = parsePagination(req, res);
  if (!pagination.valid) return;
  const { page, limit } = pagination;

  const { status, priority, assigned_to } = req.query;

  let baseQuery = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (status) {
    baseQuery += ' AND status = ?';
    params.push(status);
  }
  if (priority) {
    baseQuery += ' AND priority = ?';
    params.push(priority);
  }
  if (assigned_to) {
    baseQuery += ' AND assigned_to = ?';
    params.push(assigned_to);
  }

  const countQuery = baseQuery.replace('SELECT *', 'SELECT COUNT(*) AS count');
  const total = getDb().prepare(countQuery).get(...params).count;

  const offset = (page - 1) * limit;
  const tasks = getDb()
    .prepare(`${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json(paginatedResponse(tasks, page, limit, total));
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { title, description, status, priority, assigned_to } = parsed.data;
  const result = getDb()
    .prepare(
      'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, description, status, priority, assigned_to);

  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const { title, description, status, priority, assigned_to } = req.body;
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  getDb()
    .prepare(
      'UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .run(
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
