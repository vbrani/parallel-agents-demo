const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');
const { errorHandler } = require('./middleware/errorHandler');
const { initDb } = require('./models/db');

const app = express();
const PORT = process.env.PORT || 3000;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  statusCode: 429,
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  statusCode: 429,
  skip: (req) => req.method !== 'POST',
});

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(globalLimiter);
app.use(postLimiter);

app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

if (require.main === module) {
  initDb();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
