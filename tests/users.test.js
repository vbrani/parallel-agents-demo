/**
 * Tests for GET endpoints in /api/users.
 *
 * Same isolation strategy as tasks.test.js: mock db.js to use an in-memory
 * SQLite database before requiring the app.  Each test file gets its own Jest
 * module registry, so the two files do not share state.
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

let seededUserId;

function seedData() {
  const db = getDb();

  const u1 = db
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .run('Alice', 'alice@example.com');
  seededUserId = u1.lastInsertRowid;

  db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(
    'Bob',
    'bob@example.com'
  );

  // Assign one task to Alice so we can test GET /api/users/:id/tasks.
  db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run('Alices Task', 'A task for Alice', 'todo', 'high', seededUserId);

  db.prepare(
    'INSERT INTO tasks (title, description, status, priority, assigned_to) VALUES (?, ?, ?, ?, ?)'
  ).run('Unassigned Task', 'No owner', 'in_progress', 'low', null);
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

// ─── GET /api/users ───────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns 200 and a paginated response with an array of all users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 2 });
  });

  it('each user has the expected fields', async () => {
    const res = await request(app).get('/api/users');
    const user = res.body.data[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('created_at');
  });

  it('does not expose passwords or sensitive fields', async () => {
    const res = await request(app).get('/api/users');
    const user = res.body.data[0];
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('password_hash');
  });
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────

describe('GET /api/users/:id', () => {
  it('returns 200 and the correct user when found', async () => {
    const res = await request(app).get(`/api/users/${seededUserId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seededUserId);
    expect(res.body.name).toBe('Alice');
    expect(res.body.email).toBe('alice@example.com');
  });

  it('returns 404 with error message when user does not exist', async () => {
    const res = await request(app).get('/api/users/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });
});

// ─── GET /api/users/:id/tasks ─────────────────────────────────────────────────

describe('GET /api/users/:id/tasks', () => {
  it('returns 200 and an array of tasks belonging to the user', async () => {
    const res = await request(app).get(`/api/users/${seededUserId}/tasks`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('returned tasks are all assigned to the requested user', async () => {
    const res = await request(app).get(`/api/users/${seededUserId}/tasks`);
    for (const task of res.body) {
      expect(task.assigned_to).toBe(seededUserId);
    }
  });

  it('each task has the expected fields', async () => {
    const res = await request(app).get(`/api/users/${seededUserId}/tasks`);
    const task = res.body[0];
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title');
    expect(task).toHaveProperty('status');
    expect(task).toHaveProperty('priority');
    expect(task).toHaveProperty('assigned_to');
  });

  it('returns an empty array when the user has no tasks', async () => {
    // Bob has no tasks assigned.
    const allUsersRes = await request(app).get('/api/users');
    const bob = allUsersRes.body.data.find((u) => u.name === 'Bob');

    const res = await request(app).get(`/api/users/${bob.id}/tasks`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('returns 404 when the user does not exist', async () => {
    const res = await request(app).get('/api/users/99999/tasks');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });
});
