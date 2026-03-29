const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDb } = require('../models/db');

const createTaskSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assigned_to: z.number().optional(),
});

// GET /api/tasks - List all tasks
router.get('/', (req, res) => {
  const { status, priority, assigned_to } = req.query;

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
  const tasks = getDb().prepare(
    `${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/tasks/bulk - Create multiple tasks atomically
router.post('/bulk', (req, res) => {
  const bulkSchema = z.object({ tasks: z.array(createTaskSchema).min(1, 'tasks array must not be empty') });

  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const taskErrors = parsed.error.issues
      .filter((issue) => issue.path[0] === 'tasks' && typeof issue.path[1] === 'number')
      .reduce((acc, issue) => {
        const idx = issue.path[1];
        if (!acc[idx]) acc[idx] = {};
        const field = issue.path[2] || '_';
        acc[idx][field] = issue.message;
        return acc;
      }, {});

    return res.status(400).json({
      error: 'Validation failed',
      fieldErrors,
      taskErrors,
    });
  }

  const tasks = parsed.data.tasks;
  const db = getDb();

  const insert = db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((taskList) => {
    return taskList.map(({ title, description, status, priority, assigned_to }) => {
      const result = insert.run(title, description, status, priority, assigned_to);
      return db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    });
  });

  const created = insertMany(tasks);
  res.status(201).json({ created, count: created.length });
});

// GET /api/tasks/stats
router.get('/stats', (req, res) => {
  const db = getDb();

  const statusRows = db.prepare(
    'SELECT status, COUNT(*) AS count FROM tasks GROUP BY status'
  ).all();

  const priorityRows = db.prepare(
    'SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority'
  ).all();

  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  for (const row of statusRows) {
    if (row.status in byStatus) byStatus[row.status] = row.count;
  }

  const byPriority = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of priorityRows) {
    if (row.priority in byPriority) byPriority[row.priority] = row.count;
  }

  const total = byStatus.todo + byStatus.in_progress + byStatus.done;

  res.json({ total, byStatus, byPriority });
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
  const result = getDb().prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run(title, description, status, priority, assigned_to);

  const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const { title, description, status, priority, assigned_to } = req.body;
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  getDb().prepare(
    'UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
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
