const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const {
  startOrGetOpenCount, getCount, saveItem, saveCount, finalizeCount, getReport,
} = require('../controllers/stockCountController');

const router = express.Router();

router.use(authenticate);

router.get('/finalized', asyncHandler(async (req, res) => {
  const pool = require('../db/pool');
  const result = await pool.query(
    `SELECT sc.id, sc.created_at, sc.status, u.name AS unit_name,
            COUNT(sci.id) FILTER (WHERE sci.qty_to_buy > 0) AS items_to_buy
     FROM stock_counts sc
     JOIN units u ON u.id = sc.unit_id
     LEFT JOIN stock_count_items sci ON sci.stock_count_id = sc.id
     WHERE sc.status = 'finalizada'
     GROUP BY sc.id, u.name
     ORDER BY sc.id DESC`
  );
  res.json(result.rows);
}));

router.post('/', asyncHandler(startOrGetOpenCount));
router.get('/:id', asyncHandler(getCount));
router.put('/:id/items', asyncHandler(saveItem));
router.post('/:id/save', asyncHandler(saveCount));
router.post('/:id/finalize', requireRole('gerente'), asyncHandler(finalizeCount));
router.get('/:id/report', requireRole('gerente'), asyncHandler(getReport));

module.exports = router;
