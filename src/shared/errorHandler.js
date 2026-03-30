function errorHandler(err, req, res, next) {
  console.error(err.stack);

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
