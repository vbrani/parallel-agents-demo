# Task Manager API

A Node.js/Express REST API with SQLite for task management.

## Setup
```
npm install
npm run dev
```

## Known Issues
- No input validation on POST /api/tasks and POST /api/users
- updated_at field never gets updated on PUT /api/tasks/:id
- No test coverage
- No request logging middleware
- No rate limiting
- No pagination on list endpoints
