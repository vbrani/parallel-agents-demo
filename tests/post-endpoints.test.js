/**
 * Tests for POST endpoints: POST /api/tasks and POST /api/users.
 *
 * Database isolation strategy: jest.mock() replaces db.js before any module
 * is loaded.  The factory creates an in-memory SQLite database so tests never
 * touch data.db.  Jest hoists jest.mock() calls; variables accessed inside the
 * factory must be prefixed with "mock" to bypass the scope restriction.
 */

jest.mock('../src/models/db', () => {
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

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  initDb();
});

afterEach(() => {
  const db = getDb();
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM users');
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────

describe('POST /api/tasks', () => {
  it('successfully creates a task with valid data', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'New Task', description: 'A test task', status: 'in_progress', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('New Task');
    expect(res.body.description).toBe('A test task');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
  });

  it('applies default status=todo and priority=medium when omitted', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Minimal Task' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'No title here', status: 'todo', priority: 'low' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('title');
  });

  it('returns 400 when title is an empty string', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('title');
  });

  it('returns 400 when status is an invalid value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', status: 'invalid_status' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('status');
  });

  it('returns 400 when priority is an invalid value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', priority: 'urgent' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('priority');
  });
});

// ─── POST /api/users ──────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  it('successfully creates a user with valid data', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Alice');
    expect(res.body.email).toBe('alice@example.com');
    expect(res.body).toHaveProperty('created_at');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'noname@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('name');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'No Email' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('email');
  });

  it('returns 400 when email is in an invalid format', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Bad Email', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('email');
  });

  it('returns 409 when email is a duplicate', async () => {
    // Insert the first user.
    await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@example.com' });

    // Attempt to insert a second user with the same email.
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice Clone', email: 'alice@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
});
