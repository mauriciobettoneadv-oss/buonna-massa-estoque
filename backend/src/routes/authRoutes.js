const express = require('express');
const { login, forgotPassword, resetPassword } = require('../controllers/authController');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.post('/login', asyncHandler(login));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));

module.exports = router;
