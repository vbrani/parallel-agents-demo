const express = require('express');
const router = express.Router();
const { getDb } = require('../../shared/db');
const { parsePagination, paginatedResponse } = require('../../shared/pagination');

// GET /api/tasks/search - Search tasks by title and description
router.get('/', (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'q parameter is required' });
  }

  const pagination = parsePagination(req, res);
  if (!pagination.valid) return;
  const { page, limit } = pagination;

  const pattern = `%${q}%`;
  const baseQuery = 'SELECT * FROM tasks WHERE (title LIKE ? OR description LIKE ?)';
  const countQuery = 'SELECT COUNT(*) AS count FROM tasks WHERE (title LIKE ? OR description LIKE ?)';

  const total = getDb().prepare(countQuery).get(pattern, pattern).count;

  const offset = (page - 1) * limit;
  const tasks = getDb()
    .prepare(`${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(pattern, pattern, limit, offset);

  res.json(paginatedResponse(tasks, page, limit, total));
});

module.exports = router;
