const express = require('express');
const router = express.Router();
const { getDb } = require('../../shared/db');
const { parsePagination, paginatedResponse } = require('../../shared/pagination');

/**
 * Build highlight info for a single task.
 * Returns an object like:
 *   { title: ['fix', 'bug'], description: ['bug'] }
 * listing which search words matched in each field.
 */
function buildHighlights(task, words) {
  const highlights = { title: [], description: [] };
  const titleLower = (task.title || '').toLowerCase();
  const descLower = (task.description || '').toLowerCase();

  for (const word of words) {
    const w = word.toLowerCase();
    if (titleLower.includes(w)) highlights.title.push(word);
    if (descLower.includes(w)) highlights.description.push(word);
  }

  return highlights;
}

// GET /api/tasks/search - Search tasks by title and description
//
// Query params:
//   q      - search query (required); multiple words are split on whitespace
//   match  - "all" (default) every word must match at least one field
//            "any"           at least one word must match at least one field
router.get('/', (req, res) => {
  const { q, match = 'all' } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'q parameter is required' });
  }

  const pagination = parsePagination(req, res);
  if (!pagination.valid) return;
  const { page, limit } = pagination;

  // Split query into individual words, remove empty tokens
  const words = q.trim().split(/\s+/).filter(Boolean);

  // Build per-word condition: title LIKE %word% OR description LIKE %word%
  const wordConditions = words.map(() => '(title LIKE ? OR description LIKE ?)');
  const wordParams = words.flatMap(w => [`%${w}%`, `%${w}%`]);

  // Combine word conditions with AND (all) or OR (any)
  const joiner = match === 'any' ? ' OR ' : ' AND ';
  const whereClause = wordConditions.join(joiner);

  const baseSQL = `SELECT * FROM tasks WHERE (${whereClause})`;
  const countSQL = `SELECT COUNT(*) AS count FROM tasks WHERE (${whereClause})`;

  const total = getDb().prepare(countSQL).get(...wordParams).count;

  const offset = (page - 1) * limit;
  const tasks = getDb()
    .prepare(`${baseSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...wordParams, limit, offset);

  const data = tasks.map(task => ({
    ...task,
    highlights: buildHighlights(task, words),
  }));

  res.json(paginatedResponse(data, page, limit, total));
});

module.exports = router;
