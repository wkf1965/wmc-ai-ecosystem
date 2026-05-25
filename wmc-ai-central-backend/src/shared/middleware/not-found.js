/**
 * 404 catch-all middleware.
 * Must be registered AFTER all routes and BEFORE the error handler.
 */
function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method,
    hint: 'See GET /api/v1 for available routes',
  })
}

module.exports = { notFound }
