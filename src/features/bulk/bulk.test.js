/**
 * Tests for POST /api/tasks/bulk.
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

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  initDb();
});

afterEach(() => {
  const db = getDb();
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM users');
});

// ─── POST /api/tasks/bulk ─────────────────────────────────────────────────────

describe('POST /api/tasks/bulk', () => {
  it('creates multiple tasks atomically and returns 201', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({
        tasks: [
          { title: 'Bulk Task 1', status: 'todo', priority: 'high' },
          { title: 'Bulk Task 2', status: 'in_progress', priority: 'medium' },
          { title: 'Bulk Task 3', status: 'done', priority: 'low' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('created');
    expect(res.body).toHaveProperty('count', 3);
    expect(Array.isArray(res.body.created)).toBe(true);
    expect(res.body.created.length).toBe(3);
  });

  it('each created task has the expected fields', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({
        tasks: [{ title: 'Field Check Task' }],
      });

    expect(res.status).toBe(201);
    const task = res.body.created[0];
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title', 'Field Check Task');
    expect(task).toHaveProperty('status', 'todo');
    expect(task).toHaveProperty('priority', 'medium');
  });

  it('applies defaults for status and priority when omitted', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({
        tasks: [{ title: 'Defaults Task' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.created[0].status).toBe('todo');
    expect(res.body.created[0].priority).toBe('medium');
  });

  it('returns 400 when tasks array is empty', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({ tasks: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 when tasks key is missing', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 with per-task errors when a task is invalid', async () => {
    const res = await request(app)
      .post('/api/tasks/bulk')
      .send({
        tasks: [
          { title: 'Valid Task' },
          { title: '', status: 'bad_status' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('taskErrors');
    // Index 1 should have errors.
    expect(res.body.taskErrors).toHaveProperty('1');
  });

  it('persists all tasks in the database on success', async () => {
    await request(app)
      .post('/api/tasks/bulk')
      .send({
        tasks: [
          { title: 'Persist A' },
          { title: 'Persist B' },
        ],
      });

    const listRes = await request(app).get('/api/tasks');
    expect(listRes.body.pagination.total).toBe(2);
  });
});
