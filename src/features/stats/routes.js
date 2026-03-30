const express = require('express');
const router = express.Router();
const { getDb } = require('../../shared/db');

// GET /api/tasks/stats
router.get('/', (req, res) => {
  const db = getDb();

  const statusRows = db
    .prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status')
    .all();

  const priorityRows = db
    .prepare('SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority')
    .all();

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

module.exports = router;
