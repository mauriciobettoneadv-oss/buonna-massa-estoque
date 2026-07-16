const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const {
  listProducts, createProduct, updateProduct, setActive,
} = require('../controllers/productController');

const router = express.Router();

router.use(authenticate);
router.get('/', asyncHandler(listProducts));
router.post('/', requireRole('proprietario'), asyncHandler(createProduct));
router.put('/:id', requireRole('proprietario'), asyncHandler(updateProduct));
router.patch('/:id/active', requireRole('proprietario'), asyncHandler(setActive));

module.exports = router;
