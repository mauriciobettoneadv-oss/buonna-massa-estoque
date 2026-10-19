const pool = require('../db/pool');

async function listConferencias(req, res) {
  const result = await pool.query(
    `SELECT cp.*, q.status AS quotation_status,
            u.name AS criado_por_name,
            array_agg(DISTINCT un.name) AS units
     FROM conferencia_pedido cp
     JOIN quotations q ON q.id = cp.quotation_id
     JOIN quotation_counts qc ON qc.quotation_id = q.id
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units un ON un.id = sc.unit_id
     LEFT JOIN users u ON u.id = cp.criado_por
     GROUP BY cp.id, q.status, u.name
     ORDER BY cp.id DESC`
  );
  res.json(result.rows);
}

async function createConferencia(req, res) {
  const { quotation_id, itens } = req.body;
  const result = await pool.query(
    `INSERT INTO conferencia_pedido (quotation_id, criado_por, itens)
     VALUES ($1, $2, $3) RETURNING *`,
    [quotation_id, req.user.id, JSON.stringify(itens || [])]
  );
  res.status(201).json(result.rows[0]);
}

async function getConferencia(req, res) {
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM conferencia_pedido WHERE id = $1`, [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Não encontrada.' });
  res.json(result.rows[0]);
}

async function updateConferencia(req, res) {
  const { id } = req.params;
  const { itens, status } = req.body;
  const result = await pool.query(
    `UPDATE conferencia_pedido SET itens = COALESCE($1, itens), status = COALESCE($2, status)
     WHERE id = $3 RETURNING *`,
    [itens ? JSON.stringify(itens) : null, status, id]
  );
  res.json(result.rows[0]);
}

module.exports = { listConferencias, createConferencia, getConferencia, updateConferencia };
