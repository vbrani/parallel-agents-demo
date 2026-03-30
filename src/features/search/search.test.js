/**
 * Tests for GET /api/tasks/search.
 *
 * Database isolation: jest.mock() replaces shared/db before any module loads,
 * substituting an in-memory SQLite database so tests never touch data.db.
 */

jest.mock('../../shared/db', () => {
  const Database = require('better-sqlite3');
  const mockDatabase = Database(':memory:');

  function initDb() {
    mockDatabase.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
        assigned_to INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return mockDatabase;
  }

  return {
    getDb: () => mockDatabase,
    initDb,
  };
});

const request = require('supertest');
const app = require('../../app');
const { initDb, getDb } = require('../../shared/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedData() {
  const db = getDb();

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority) VALUES (?, ?, ?, ?)'
  ).run('Fix login bug', 'Users cannot log in with correct credentials', 'todo', 'high');

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority) VALUES (?, ?, ?, ?)'
  ).run('Add search feature', 'Implement full-text search across tasks', 'in_progress', 'medium');

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority) VALUES (?, ?, ?, ?)'
  ).run('Update documentation', 'Rewrite the README file', 'done', 'low');
}

function clearData() {
  const db = getDb();
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM users');
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  initDb();
  seedData();
});

afterAll(() => {
  clearData();
});

// ─── GET /api/tasks/search ────────────────────────────────────────────────────

describe('GET /api/tasks/search', () => {
  it('returns 400 when q parameter is missing', async () => {
    const res = await request(app).get('/api/tasks/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'q parameter is required');
  });

  it('returns 400 when q parameter is an empty string', async () => {
    const res = await request(app).get('/api/tasks/search?q=');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'q parameter is required');
  });

  it('returns matching tasks when q matches a title', async () => {
    const res = await request(app).get('/api/tasks/search?q=login');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Fix login bug');
  });

  it('returns matching tasks when q matches a description', async () => {
    const res = await request(app).get('/api/tasks/search?q=full-text');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Add search feature');
  });

  it('returns multiple matches when q applies to several tasks', async () => {
    const res = await request(app).get('/api/tasks/search?q=e');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(1);
  });

  it('returns empty data array when no tasks match', async () => {
    const res = await request(app).get('/api/tasks/search?q=zzznomatch');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  it('returns a paginated response envelope', async () => {
    const res = await request(app).get('/api/tasks/search?q=task');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('totalPages');
  });

  it('returns 400 when page is invalid', async () => {
    const res = await request(app).get('/api/tasks/search?q=task&page=abc');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'page and limit must be positive integers');
  });

  // ─── Multi-word search (AND logic — default / match=all) ──────────────────

  it('multi-word search with match=all returns only tasks matching ALL words', async () => {
    // "fix bug" — both words appear in title "Fix login bug"
    const res = await request(app).get('/api/tasks/search?q=fix%20bug');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Fix login bug');
  });

  it('multi-word search with match=all returns no results when not all words are present', async () => {
    // "fix readme" — no single task has both "fix" and "readme"
    const res = await request(app).get('/api/tasks/search?q=fix%20readme&match=all');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('explicit match=all behaves the same as the default', async () => {
    const resDefault = await request(app).get('/api/tasks/search?q=fix%20bug');
    const resExplicit = await request(app).get('/api/tasks/search?q=fix%20bug&match=all');
    expect(resDefault.status).toBe(200);
    expect(resExplicit.status).toBe(200);
    expect(resDefault.body.data.length).toBe(resExplicit.body.data.length);
    expect(resDefault.body.data.map(t => t.id)).toEqual(resExplicit.body.data.map(t => t.id));
  });

  // ─── Multi-word search (OR logic — match=any) ─────────────────────────────

  it('multi-word search with match=any returns tasks matching ANY word', async () => {
    // "fix readme" — "fix" matches "Fix login bug", "readme" matches "Update documentation"
    const res = await request(app).get('/api/tasks/search?q=fix%20readme&match=any');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const titles = res.body.data.map(t => t.title);
    expect(titles).toContain('Fix login bug');
    expect(titles).toContain('Update documentation');
  });

  it('match=any with a single word behaves like a normal search', async () => {
    const res = await request(app).get('/api/tasks/search?q=login&match=any');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Fix login bug');
  });

  // ─── Highlights ───────────────────────────────────────────────────────────

  it('each result includes a highlights field', async () => {
    const res = await request(app).get('/api/tasks/search?q=login');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const task of res.body.data) {
      expect(task).toHaveProperty('highlights');
      expect(task.highlights).toHaveProperty('title');
      expect(task.highlights).toHaveProperty('description');
      expect(Array.isArray(task.highlights.title)).toBe(true);
      expect(Array.isArray(task.highlights.description)).toBe(true);
    }
  });

  it('highlights.title contains the matched word when it appears in title', async () => {
    const res = await request(app).get('/api/tasks/search?q=login');
    expect(res.status).toBe(200);
    const task = res.body.data.find(t => t.title === 'Fix login bug');
    expect(task).toBeDefined();
    expect(task.highlights.title).toContain('login');
  });

  it('highlights.description contains the matched word when it appears in description', async () => {
    // "credentials" only appears in the description of "Fix login bug"
    const res = await request(app).get('/api/tasks/search?q=credentials');
    expect(res.status).toBe(200);
    const task = res.body.data.find(t => t.title === 'Fix login bug');
    expect(task).toBeDefined();
    expect(task.highlights.description).toContain('credentials');
    expect(task.highlights.title).not.toContain('credentials');
  });

  it('highlights lists all matching words across both fields', async () => {
    // "fix credentials" — "fix" in title, "credentials" in description of "Fix login bug"
    const res = await request(app).get('/api/tasks/search?q=fix%20credentials&match=all');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    const task = res.body.data[0];
    expect(task.highlights.title).toContain('fix');
    expect(task.highlights.description).toContain('credentials');
  });
});
