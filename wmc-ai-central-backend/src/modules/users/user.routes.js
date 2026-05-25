const express = require('express')
const { userController } = require('./user.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { adminOnly, supervisorOrAbove } = require('../../shared/middleware/role.middleware')

const router = express.Router()

/** GET /api/v1/users/me — own profile (any authenticated user) */
router.get('/me', requireAuth, (req, res) => userController.me(req, res))

/** GET /api/v1/users — list all users (admin/supervisor only) */
router.get('/', requireAuth, supervisorOrAbove, (req, res) => userController.list(req, res))

/** GET /api/v1/users/:id — get user by ID (admin only) */
router.get('/:id', requireAuth, adminOnly, (req, res) => userController.getById(req, res))

module.exports = router
