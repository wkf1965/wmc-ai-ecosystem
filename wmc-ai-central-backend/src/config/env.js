require('dotenv').config()

const config = {
  nodeEnv:    process.env.NODE_ENV    ?? 'development',
  port:       Number(process.env.PORT ?? 5000),
  apiPrefix:  process.env.API_PREFIX  ?? '/api',
  serviceName: 'WMC AI Central Backend',

  // JWT — access + refresh tokens
  jwtSecret:         process.env.JWT_SECRET          ?? 'wmc-dev-secret-change-in-production',
  jwtExpiresIn:      process.env.JWT_EXPIRES_IN       ?? '15m',
  jwtRefreshSecret:  process.env.JWT_REFRESH_SECRET   ?? 'wmc-dev-refresh-secret-change-in-production',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // Auth mode — 'mock' skips DB lookup for development
  authMode: process.env.AUTH_MODE ?? 'mock',
}

module.exports = { config }
