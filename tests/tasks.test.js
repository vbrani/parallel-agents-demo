/**
 * Tests for GET endpoints in /api/tasks and /health.
 *
 * Database isolation strategy: jest.mock() replaces db.js before any module
 * is loaded.  The factory creates an in-memory SQLite database so tests never
 * touch data.db.  Jest hoists jest.mock() calls; variables accessed inside the
 * factory must be prefixed with "mock" to bypass the scope restriction.
 */

// The `mock` prefix is required so Jest's babel hoisting allows the variable
// to be accessed inside the jest.mock() factory.
const mockDb = require('better-sqlite3')(':memory:');

jest.mock('../src/models/db', () => {
  // `require` is available inside the factory even after hoisting.
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
const app = require('../src/index');
const { initDb, getDb } = require('../src/models/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedData() {
  const db = getDb();

  const userResult = db
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .run('Alice', 'alice@example.com');
  const userId = userResult.lastInsertRowid;

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run('Task One', 'First task', 'todo', 'high', userId);

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run('Task Two', 'Second task', 'in_progress', 'medium', userId);

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run('Task Three', 'Third task', 'done', 'low', null);

  return { userId };
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

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─── GET /api/tasks ───────────────────────────────────────────────────────────

describe('GET /api/tasks', () => {
  it('returns 200 and a paginated response with an array of all tasks', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(3);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 3 });
  });

  it('each task has the expected fields', async () => {
    const res = await request(app).get('/api/tasks');
    const task = res.body.data[0];
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title');
    expect(task).toHaveProperty('status');
    expect(task).toHaveProperty('priority');
  });

  it('filters by status=todo', async () => {
    const res = await request(app).get('/api/tasks?status=todo');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('todo');
  });

  it('filters by status=in_progress', async () => {
    const res = await request(app).get('/api/tasks?status=in_progress');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('in_progress');
  });

  it('filters by status=done', async () => {
    const res = await request(app).get('/api/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('done');
  });

  it('filters by priority=high', async () => {
    const res = await request(app).get('/api/tasks?priority=high');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].priority).toBe('high');
  });

  it('filters by priority=medium', async () => {
    const res = await request(app).get('/api/tasks?priority=medium');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].priority).toBe('medium');
  });

  it('filters by priority=low', async () => {
    const res = await request(app).get('/api/tasks?priority=low');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].priority).toBe('low');
  });

  it('combines status and priority filters', async () => {
    const res = await request(app).get('/api/tasks?status=todo&priority=high');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('todo');
    expect(res.body.data[0].priority).toBe('high');
  });

  it('returns empty data array when no tasks match the filter', async () => {
    const res = await request(app).get('/api/tasks?status=done&priority=high');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });
});

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────────

describe('GET /api/tasks/:id', () => {
  let taskId;

  beforeAll(async () => {
    const res = await request(app).get('/api/tasks?status=todo');
    taskId = res.body.data[0].id;
  });

  it('returns 200 and the correct task when found', async () => {
    const res = await request(app).get(`/api/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe('Task One');
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('high');
  });

  it('returns 404 with error message when task does not exist', async () => {
    const res = await request(app).get('/api/tasks/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});
