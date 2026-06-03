/** Parses and validates pagination query params. Returns { skip, take, page, limit } or throws. */
function parsePagination(query, maxLimit = 100) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (query.page !== undefined && (isNaN(page) || page < 1)) {
    throw { status: 400, message: 'page must be a positive integer' };
  }
  if (query.limit !== undefined && (isNaN(limit) || limit < 1 || limit > maxLimit)) {
    throw { status: 400, message: `limit must be an integer between 1 and ${maxLimit}` };
  }

  page = isNaN(page) ? 1 : page;
  limit = isNaN(limit) ? 20 : limit;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** Parses and validates an integer route param (e.g. :id). Returns the integer or throws. */
function parseId(param) {
  const id = parseInt(param, 10);
  if (isNaN(id) || id < 1) {
    throw { status: 400, message: 'ID must be a positive integer' };
  }
  return id;
}

/** Validates an ISO date string. Returns a Date object or throws. */
function parseDate(value, fieldName) {
  if (!value) throw { status: 400, message: `${fieldName} is required` };
  const d = new Date(value);
  if (isNaN(d.getTime())) throw { status: 400, message: `${fieldName} must be a valid date (YYYY-MM-DD)` };
  return d;
}

/** Maps Prisma error codes to HTTP responses. */
function handlePrismaError(err, res) {
  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'field';
    return res.status(409).json({ error: `A record with this ${field} already exists` });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Related record does not exist' });
  }
  if (err.code === 'P2011') {
    return res.status(400).json({ error: 'A required field is null' });
  }
  return null;
}

/** Wraps async route handlers — catches both app errors and Prisma errors. */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      if (err.status) return res.status(err.status).json({ error: err.message });
      const prismaRes = handlePrismaError(err, res);
      if (!prismaRes) next(err);
    });
  };
}

module.exports = { parsePagination, parseId, parseDate, handlePrismaError, asyncHandler };
