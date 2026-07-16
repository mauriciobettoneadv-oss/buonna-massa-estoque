const pool = require('../db/pool');

async function listSuppliers(req, res) {
  const result = await pool.query(
    `SELECT s.*,
            COUNT(spp.id) AS product_count
     FROM suppliers s
     LEFT JOIN supplier_product_prices spp ON spp.supplier_id = s.id
     GROUP BY s.id ORDER BY s.name`
  );
  res.json(result.rows);
}

async function getSupplier(req, res) {
  const { id } = req.params;
  const s = await pool.query(`SELECT * FROM suppliers WHERE id = $1`, [id]);
  if (!s.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado.' });

  const prices = await pool.query(
    `SELECT spp.id, spp.product_id, spp.unit_price, spp.updated_at,
            p.name AS product_name, p.unit_measure, p.category
     FROM supplier_product_prices spp
     JOIN products p ON p.id = spp.product_id
     WHERE spp.supplier_id = $1
     ORDER BY p.category, p.name`,
    [id]
  );
  res.json({ supplier: s.rows[0], prices: prices.rows });
}

async function createSupplier(req, res) {
  const { name, categories, phone, email, min_order, delivery_days, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const result = await pool.query(
    `INSERT INTO suppliers (name, categories, phone, email, min_order, delivery_days, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, categories || [], phone, email, min_order || 0, delivery_days || [], notes]
  );
  res.status(201).json(result.rows[0]);
}

async function updateSupplier(req, res) {
  const { id } = req.params;
  const { name, categories, phone, email, min_order, delivery_days, notes } = req.body;
  const result = await pool.query(
    `UPDATE suppliers SET
       name = COALESCE($1, name),
       categories = COALESCE($2, categories),
       phone = COALESCE($3, phone),
       email = COALESCE($4, email),
       min_order = COALESCE($5, min_order),
       delivery_days = COALESCE($6, delivery_days),
       notes = COALESCE($7, notes)
     WHERE id = $8 RETURNING *`,
    [name, categories, phone, email, min_order, delivery_days, notes, id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  res.json(result.rows[0]);
}

async function toggleActive(req, res) {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE suppliers SET active = NOT active WHERE id = $1 RETURNING id, name, active`,
    [id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  res.json(result.rows[0]);
}

async function savePrice(req, res) {
  const { id } = req.params;
  const { product_id, unit_price } = req.body;
  if (!product_id || unit_price === undefined) {
    return res.status(400).json({ error: 'product_id e unit_price são obrigatórios.' });
  }
  const result = await pool.query(
    `INSERT INTO supplier_product_prices (supplier_id, product_id, unit_price, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3, updated_at = NOW()
     RETURNING *`,
    [id, product_id, unit_price]
  );
  res.json(result.rows[0]);
}

async function deletePrice(req, res) {
  const { id, priceId } = req.params;
  await pool.query(`DELETE FROM supplier_product_prices WHERE id = $1 AND supplier_id = $2`, [priceId, id]);
  res.json({ ok: true });
}

// Get all suppliers with their prices for a set of products (for intelligent quotation)
async function getQuotationPrices(req, res) {
  const { product_ids } = req.body;
  if (!product_ids?.length) return res.status(400).json({ error: 'product_ids é obrigatório.' });

  const prices = await pool.query(
    `SELECT spp.supplier_id, spp.product_id, spp.unit_price,
            s.name AS supplier_name, s.min_order,
            p.name AS product_name, p.unit_measure
     FROM supplier_product_prices spp
     JOIN suppliers s ON s.id = spp.supplier_id AND s.active = TRUE
     JOIN products p ON p.id = spp.product_id
     WHERE spp.product_id = ANY($1::int[]) AND spp.unit_price > 0
     ORDER BY spp.product_id, spp.unit_price ASC`,
    [product_ids]
  );
  res.json(prices.rows);
}

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, toggleActive, savePrice, deletePrice, getQuotationPrices };
