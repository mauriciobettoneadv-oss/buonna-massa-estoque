const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const c = require('../controllers/userController');

router.use(authenticate);
router.get('/', requireRole('gerente'), asyncHandler(c.listUsers));
router.post('/', requireRole('gerente'), asyncHandler(c.createUser));
router.put('/:id', requireRole('gerente'), asyncHandler(c.updateUser));
router.patch('/:id/active', requireRole('gerente'), asyncHandler(c.toggleActive));
router.delete('/:id', requireRole('dono'), asyncHandler(c.deleteUser)); // only dono
module.exports = router;
