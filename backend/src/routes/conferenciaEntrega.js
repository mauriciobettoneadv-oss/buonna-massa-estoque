const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const c = require('../controllers/conferenciaEntregaController');

router.use(authenticate);
router.get('/', asyncHandler(c.listEntregas));
router.get('/hoje', asyncHandler(c.getHoje));
router.post('/', asyncHandler(c.createEntrega));
router.post('/from-quotation', asyncHandler(c.createEntregaFromQuotation));
router.get('/:id', asyncHandler(c.getEntrega));
router.put('/:id/finalizar', asyncHandler(c.finalizeEntrega));
router.put('/:id/foto', asyncHandler(c.saveFoto));

module.exports = router;
