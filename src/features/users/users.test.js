/**
 * Tests for user CRUD endpoints: GET /api/users, GET /api/users/:id,
 * POST /api/users, and GET /api/users/:id/tasks.
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

// ─── POST /api/users ──────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  afterEach(() => {
    // Remove only users added during these tests (not Alice or Bob).
    const db = getDb();
    db.prepare("DELETE FROM users WHERE name NOT IN ('Alice', 'Bob')").run();
  });

  it('successfully creates a user with valid data', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Charlie', email: 'charlie@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Charlie');
    expect(res.body.email).toBe('charlie@example.com');
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
    // Insert first user.
    await request(app)
      .post('/api/users')
      .send({ name: 'Dupe User', email: 'dupe@example.com' });

    // Attempt duplicate.
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Dupe Clone', email: 'dupe@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/users/:id/notify ──────────────────────────────────────────────

describe('POST /api/users/:id/notify', () => {
  it('returns 200 and a notification receipt when the user exists and body is valid', async () => {
    const res = await request(app)
      .post(`/api/users/${seededUserId}/notify`)
      .send({ subject: 'Hello', message: 'Welcome aboard!' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sent: true,
      to: 'alice@example.com',
      subject: 'Hello',
    });
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns 404 when the user does not exist', async () => {
    const res = await request(app)
      .post('/api/users/99999/notify')
      .send({ subject: 'Hello', message: 'Ghost mail' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });

  it('returns 400 when subject is missing', async () => {
    const res = await request(app)
      .post(`/api/users/${seededUserId}/notify`)
      .send({ message: 'No subject here' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('subject');
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(app)
      .post(`/api/users/${seededUserId}/notify`)
      .send({ subject: 'No message here' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors).toHaveProperty('message');
  });

  it('returns 400 when subject is an empty string', async () => {
    const res = await request(app)
      .post(`/api/users/${seededUserId}/notify`)
      .send({ subject: '', message: 'Valid message' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('subject');
  });

  it('returns 400 when message is an empty string', async () => {
    const res = await request(app)
      .post(`/api/users/${seededUserId}/notify`)
      .send({ subject: 'Valid subject', message: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('message');
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
