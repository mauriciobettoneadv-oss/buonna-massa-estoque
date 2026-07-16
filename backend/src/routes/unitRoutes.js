const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM units ORDER BY name');
  res.json(result.rows);
}));

module.exports = router;
