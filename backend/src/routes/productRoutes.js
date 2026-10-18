const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const {
  listProducts, createProduct, updateProduct, setActive,
} = require('../controllers/productController');

const router = express.Router();

router.use(authenticate);
router.get('/', asyncHandler(listProducts));
router.put('/reorder', requireRole('gerente'), asyncHandler(async (req, res) => {
  const pool = require('../db/pool');
  const { ids } = req.body;
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE products SET ordem = $1 WHERE id = $2', [i + 1, ids[i]]);
  }
  res.json({ ok: true });
}));
router.post('/', requireRole('gerente'), asyncHandler(createProduct));
router.put('/:id', requireRole('gerente'), asyncHandler(updateProduct));
router.patch('/:id/active', requireRole('gerente'), asyncHandler(setActive));

module.exports = router;
