const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const c = require('../controllers/supplierController');

router.use(authenticate);
router.get('/', asyncHandler(c.listSuppliers));
router.post('/quotation-prices', asyncHandler(c.getQuotationPrices));
router.get('/:id', asyncHandler(c.getSupplier));
router.post('/', asyncHandler(c.createSupplier));
router.put('/:id', asyncHandler(c.updateSupplier));
router.patch('/:id/active', asyncHandler(c.toggleActive));
router.post('/:id/prices', asyncHandler(c.savePrice));
router.delete('/:id/prices/:priceId', asyncHandler(c.deletePrice));
module.exports = router;
