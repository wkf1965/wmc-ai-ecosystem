const userService = require('./user.service')

const userController = {
  async list(req, res) {
    try {
      const result = await userService.listUsers({
        role:     req.query.role,
        isActive: req.query.isActive,
      })
      res.json(result)
    } catch (err) {
      console.error('[users GET]', err)
      res.status(500).json({ error: 'Failed to list users' })
    }
  },

  async getById(req, res) {
    try {
      const result = await userService.getUserById(req.params.id)
      if (!result.user) {
        return res.status(404).json({ error: 'User not found' })
      }
      res.json(result)
    } catch (err) {
      console.error('[users GET :id]', err)
      res.status(500).json({ error: 'Failed to fetch user' })
    }
  },

  /** GET /api/v1/users/me — return own profile from JWT payload */
  async me(req, res) {
    res.json({
      user:   req.user,
      source: req.user?.mock ? 'mock' : 'jwt',
    })
  },
}

module.exports = { userController }
