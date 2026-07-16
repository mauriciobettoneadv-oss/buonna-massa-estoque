const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const c = require('../controllers/supplierController');

router.use(authenticate);
router.get('/', requireRole('gerente'), asyncHandler(c.listSuppliers));
router.post('/quotation-prices', requireRole('gerente'), asyncHandler(c.getQuotationPrices));
router.get('/:id', requireRole('gerente'), asyncHandler(c.getSupplier));
router.post('/', requireRole('gerente'), asyncHandler(c.createSupplier));
router.put('/:id', requireRole('gerente'), asyncHandler(c.updateSupplier));
router.patch('/:id/active', requireRole('gerente'), asyncHandler(c.toggleActive));
router.post('/:id/prices', requireRole('gerente'), asyncHandler(c.savePrice));
router.delete('/:id/prices/:priceId', requireRole('gerente'), asyncHandler(c.deletePrice));
module.exports = router;
