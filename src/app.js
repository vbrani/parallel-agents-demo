const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const taskRoutes = require('./features/tasks/routes');
const userRoutes = require('./features/users/routes');
const searchRoutes = require('./features/search/routes');
const statsRoutes = require('./features/stats/routes');
const bulkRoutes = require('./features/bulk/routes');
const healthRouter = require('./health');
const { errorHandler } = require('./shared/errorHandler');

const app = express();

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

// Feature routes — order matters: specific sub-paths before the generic /:id
app.use('/api/tasks/search', searchRoutes);
app.use('/api/tasks/stats', statsRoutes);
app.use('/api/tasks/bulk', bulkRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/health', healthRouter);

app.use(errorHandler);

module.exports = app;
