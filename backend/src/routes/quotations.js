const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const c = require('../controllers/quotationController');
const { extractPrices, extractPricesFromText } = require('../controllers/extractPricesController');

const upload = multer({
  dest: path.join(__dirname, '../../tmp/'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas imagens e PDFs são aceitos.'));
  },
});

router.use(authenticate);

router.get('/', asyncHandler(c.listQuotations));
router.post('/', requireRole('proprietario'), asyncHandler(c.createQuotation));
router.get('/:id', asyncHandler(c.getQuotation));
router.get('/:id/orders', asyncHandler(c.getOrders));
router.post('/:id/suppliers', requireRole('proprietario'), asyncHandler(c.addSupplier));
router.delete('/:id/suppliers/:supplierId', requireRole('proprietario'), asyncHandler(c.deleteSupplier));
router.put('/:id/suppliers/:supplierId/prices', requireRole('proprietario'), asyncHandler(c.savePrices));
router.post('/:id/suppliers/:supplierId/extract', requireRole('proprietario'), upload.array('files', 10), asyncHandler(extractPrices));
router.post('/:id/suppliers/:supplierId/extract-text', requireRole('proprietario'), asyncHandler(extractPricesFromText));

module.exports = router;
