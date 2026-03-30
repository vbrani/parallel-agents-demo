/**
 * Tests for GET /api/tasks/stats.
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
    'INSERT INTO tasks (title, status, priority) VALUES (?, ?, ?)'
  ).run('Task A', 'todo', 'high');

  db.prepare(
    'INSERT INTO tasks (title, status, priority) VALUES (?, ?, ?)'
  ).run('Task B', 'todo', 'medium');

  db.prepare(
    'INSERT INTO tasks (title, status, priority) VALUES (?, ?, ?)'
  ).run('Task C', 'in_progress', 'low');

  db.prepare(
    'INSERT INTO tasks (title, status, priority) VALUES (?, ?, ?)'
  ).run('Task D', 'done', 'critical');
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

// ─── GET /api/tasks/stats ─────────────────────────────────────────────────────

describe('GET /api/tasks/stats', () => {
  it('returns 200 with total, byStatus, and byPriority', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('byStatus');
    expect(res.body).toHaveProperty('byPriority');
  });

  it('total reflects the number of seeded tasks', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.body.total).toBe(4);
  });

  it('byStatus counts are correct', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.body.byStatus.todo).toBe(2);
    expect(res.body.byStatus.in_progress).toBe(1);
    expect(res.body.byStatus.done).toBe(1);
  });

  it('byPriority counts are correct', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.body.byPriority.high).toBe(1);
    expect(res.body.byPriority.medium).toBe(1);
    expect(res.body.byPriority.low).toBe(1);
    expect(res.body.byPriority.critical).toBe(1);
  });

  it('byStatus has all expected keys with zero as default', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.body.byStatus).toHaveProperty('todo');
    expect(res.body.byStatus).toHaveProperty('in_progress');
    expect(res.body.byStatus).toHaveProperty('done');
  });

  it('byPriority has all expected keys', async () => {
    const res = await request(app).get('/api/tasks/stats');
    expect(res.body.byPriority).toHaveProperty('low');
    expect(res.body.byPriority).toHaveProperty('medium');
    expect(res.body.byPriority).toHaveProperty('high');
    expect(res.body.byPriority).toHaveProperty('critical');
  });
});
