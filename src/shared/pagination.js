/**
 * Parses and validates pagination query parameters from an Express request.
 *
 * Returns { valid: false, res } when the params are invalid (the handler has
 * already sent a 400 response via `res`).
 * Returns { valid: true, page, limit } on success.
 */
function parsePagination(req, res) {
  const pageNum = parseInt(req.query.page, 10);
  const limitNum = parseInt(req.query.limit, 10);

  if (
    (req.query.page !== undefined && (isNaN(pageNum) || pageNum < 1)) ||
    (req.query.limit !== undefined && (isNaN(limitNum) || limitNum < 1))
  ) {
    res.status(400).json({ error: 'page and limit must be positive integers' });
    return { valid: false };
  }

  const page = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
  const limit = isNaN(limitNum) || limitNum < 1 ? 20 : limitNum;

  return { valid: true, page, limit };
}

/**
 * Builds the standard paginated response envelope.
 */
function paginatedResponse(data, page, limit, total) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { parsePagination, paginatedResponse };
