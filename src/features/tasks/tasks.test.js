/**
 * Tests for task CRUD endpoints: GET /api/tasks, GET /api/tasks/:id,
 * POST /api/tasks, PUT /api/tasks/:id, DELETE /api/tasks/:id, and GET /health.
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

// ─── POST /api/tasks ──────────────────────────────────────────────────────────

describe('POST /api/tasks', () => {
  afterEach(() => {
    // Clean up only newly created tasks, keeping seeded ones.
    // We identify seeded tasks by their known titles.
    const db = getDb();
    db.prepare(
      "DELETE FROM tasks WHERE title NOT IN ('Task One', 'Task Two', 'Task Three')"
    ).run();
  });

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

// ─── PUT /api/tasks/:id ───────────────────────────────────────────────────────

describe('PUT /api/tasks/:id', () => {
  let taskId;

  beforeAll(async () => {
    const res = await request(app).get('/api/tasks?status=todo');
    taskId = res.body.data[0].id;
  });

  it('updates a task and returns the updated task', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ title: 'Updated Task', status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe('Updated Task');
    expect(res.body.status).toBe('done');
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .put('/api/tasks/99999')
      .send({ title: 'Ghost Task' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────

describe('DELETE /api/tasks/:id', () => {
  let tempTaskId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Temp Task To Delete' });
    tempTaskId = res.body.id;
  });

  it('deletes a task and returns 204', async () => {
    const res = await request(app).delete(`/api/tasks/${tempTaskId}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/tasks/${tempTaskId}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app).delete('/api/tasks/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});
