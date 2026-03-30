const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDb } = require('../../shared/db');
const { createTaskSchema } = require('../tasks/validation');

const bulkSchema = z.object({
  tasks: z.array(createTaskSchema).min(1, 'tasks array must not be empty'),
});

// POST /api/tasks/bulk - Create multiple tasks atomically
router.post('/', (req, res) => {
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

module.exports = router;
