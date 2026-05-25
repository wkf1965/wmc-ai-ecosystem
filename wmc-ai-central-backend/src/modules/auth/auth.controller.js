const authService = require('./auth.service')

const authController = {
  /**
   * POST /api/v1/auth/login
   * Body: { email, password }
   */
  async login(req, res) {
    try {
      const { email, password } = req.body ?? {}
      const result = await authService.login(email, password, req)

      if (!result.success) {
        return res.status(401).json({ error: result.error })
      }

      res.status(200).json(result)
    } catch (err) {
      console.error('[auth/login]', err)
      res.status(500).json({ error: 'Login failed' })
    }
  },

  /**
   * POST /api/v1/auth/refresh
   * Body: { refreshToken }
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body ?? {}
      const result = await authService.refresh(refreshToken)

      if (!result.success) {
        return res.status(401).json({ error: result.error })
      }

      res.status(200).json(result)
    } catch (err) {
      console.error('[auth/refresh]', err)
      res.status(500).json({ error: 'Token refresh failed' })
    }
  },

  /**
   * POST /api/v1/auth/logout
   * Body: { refreshToken }
   */
  logout(req, res) {
    try {
      const { refreshToken } = req.body ?? {}
      const result = authService.logout(refreshToken, req)
      res.status(200).json(result)
    } catch (err) {
      console.error('[auth/logout]', err)
      res.status(500).json({ error: 'Logout failed' })
    }
  },

  /**
   * GET /api/v1/auth/me
   * Returns the caller's identity from the verified JWT payload.
   */
  me(req, res) {
    res.json({
      user:   req.user,
      source: req.user?.mock ? 'mock' : 'jwt',
    })
  },
}

module.exports = { authController }
