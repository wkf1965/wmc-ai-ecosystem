/**
 * Global error handler middleware.
 * Must be registered LAST with app.use() after all routes.
 * Signature must have 4 params so Express recognises it as an error handler.
 */
function errorHandler(err, req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500

  if (status >= 500) {
    console.error(`[error-handler] ${req.method} ${req.path}`, err)
  }

  res.status(status).json({
    error: err.message ?? 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = { errorHandler }
