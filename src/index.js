const express = require('express');
const cors = require('cors');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');
const { errorHandler } = require('./middleware/errorHandler');
const { initDb } = require('./models/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

if (require.main === module) {
  initDb();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
