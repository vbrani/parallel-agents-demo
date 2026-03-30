const app = require('./app');
const { initDb } = require('./shared/db');

const PORT = process.env.PORT || 3000;

initDb();
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
