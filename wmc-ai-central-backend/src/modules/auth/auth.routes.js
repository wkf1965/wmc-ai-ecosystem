const express = require('express')
const { authController } = require('./auth.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')

const router = express.Router()

/** POST /api/v1/auth/login — obtain access + refresh token */
router.post('/login', (req, res) => authController.login(req, res))

/** POST /api/v1/auth/refresh — exchange refresh token for new access token */
router.post('/refresh', (req, res) => authController.refresh(req, res))

/** POST /api/v1/auth/logout — revoke refresh token */
router.post('/logout', (req, res) => authController.logout(req, res))

/** GET /api/v1/auth/me — own identity (requires valid token) */
router.get('/me', requireAuth, (req, res) => authController.me(req, res))

module.exports = router
