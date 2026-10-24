const pool = require('../db/pool');

async function exportData(req, res) {
  const [counts, countItems, quotations, conferencias, entradas] = await Promise.all([
    pool.query(`
      SELECT sc.id, sc.status, sc.created_at, sc.saved_at, sc.finalized_at,
             u.name AS unit, cb.name AS criado_por, fb.name AS finalizado_por
      FROM stock_counts sc
      JOIN units u ON u.id = sc.unit_id
      LEFT JOIN users cb ON cb.id = sc.created_by
      LEFT JOIN users fb ON fb.id = sc.finalized_by
      ORDER BY sc.id DESC
    `),
    pool.query(`
      SELECT sci.stock_count_id, p.name AS produto, p.unit_measure, p.purchase_unit,
             sci.current_stock, sci.qty_to_buy
      FROM stock_count_items sci
      JOIN products p ON p.id = sci.product_id
      ORDER BY sci.stock_count_id DESC, p.name
    `),
    pool.query(`
      SELECT q.id, q.status, q.created_at,
             array_agg(DISTINCT u.name) AS unidades
      FROM quotations q
      JOIN quotation_counts qc ON qc.quotation_id = q.id
      JOIN stock_counts sc ON sc.id = qc.stock_count_id
      JOIN units u ON u.id = sc.unit_id
      GROUP BY q.id ORDER BY q.id DESC
    `),
    pool.query(`
      SELECT cp.id, cp.quotation_id, cp.criado_em, u.name AS criado_por, cp.itens
      FROM conferencia_pedido cp
      LEFT JOIN users u ON u.id = cp.criado_por
      ORDER BY cp.id DESC
    `),
    pool.query(`
      SELECT ce.id, ce.conferencia_pedido_id, ce.finalizado_em, ce.status, ce.itens,
             u.name AS conferente
      FROM conferencia_entrega ce
      LEFT JOIN users u ON u.id = ce.conferente_id
      ORDER BY ce.id DESC
    `).catch(() => ({ rows: [] })),
  ]);

  res.json({
    exportado_em: new Date().toISOString(),
    contagens: counts.rows,
    itens_contagem: countItems.rows,
    cotacoes: quotations.rows,
    conferencias_pedido: conferencias.rows,
    conferencias_entrega: entradas.rows,
  });
}

module.exports = { exportData };
