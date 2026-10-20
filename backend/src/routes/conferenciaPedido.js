const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const c = require('../controllers/conferenciaPedidoController');

router.use(authenticate);
router.get('/', asyncHandler(c.listConferencias));
router.post('/', requireRole('gerente'), asyncHandler(c.createConferencia));
router.post('/extract-from-image', asyncHandler(c.extractFromImage));
router.get('/:id', asyncHandler(c.getConferencia));
router.put('/:id', requireRole('gerente'), asyncHandler(c.updateConferencia));

module.exports = router;
