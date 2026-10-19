const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const c = require('../controllers/conferenciaEntregaController');

router.use(authenticate);
router.get('/', asyncHandler(c.listEntregas));
router.post('/', asyncHandler(c.createEntrega));
router.get('/:id', asyncHandler(c.getEntrega));
router.put('/:id/finalizar', asyncHandler(c.finalizeEntrega));

module.exports = router;
