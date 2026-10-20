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
  const contacts = await pool.query(
    `SELECT suc.*, u.name AS unit_name
     FROM supplier_unit_contacts suc
     JOIN units u ON u.id = suc.unit_id
     WHERE suc.supplier_id = $1
     ORDER BY u.id`,
    [id]
  );
  res.json({ supplier: s.rows[0], prices: prices.rows, contacts: contacts.rows });
}

async function createSupplier(req, res) {
  const { name, categories, phone, email, min_order, delivery_days, delivery_cities, notes, canais_compra, canal_preferencial } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const result = await pool.query(
    `INSERT INTO suppliers (name, categories, phone, email, min_order, delivery_days, delivery_cities, notes, canais_compra, canal_preferencial)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [name, categories || [], phone, email, min_order || 0, delivery_days || [], delivery_cities || [], notes, JSON.stringify(canais_compra || []), canal_preferencial || null]
  );
  res.status(201).json(result.rows[0]);
}

async function updateSupplier(req, res) {
  const { id } = req.params;
  const { name, categories, phone, email, min_order, delivery_days, delivery_cities, notes, canais_compra, mesmo_vendedor, canal_preferencial } = req.body;
  const result = await pool.query(
    `UPDATE suppliers SET
       name = COALESCE($1, name),
       categories = COALESCE($2, categories),
       phone = COALESCE($3, phone),
       email = COALESCE($4, email),
       min_order = COALESCE($5, min_order),
       delivery_days = COALESCE($6, delivery_days),
       delivery_cities = COALESCE($7, delivery_cities),
       notes = COALESCE($8, notes),
       canais_compra = COALESCE($10, canais_compra),
       mesmo_vendedor = COALESCE($11, mesmo_vendedor),
       canal_preferencial = COALESCE($12, canal_preferencial)
     WHERE id = $9 RETURNING *`,
    [name, categories, phone, email, min_order, delivery_days, delivery_cities, notes, id,
     canais_compra !== undefined ? JSON.stringify(canais_compra) : null,
     mesmo_vendedor !== undefined ? mesmo_vendedor : null,
     canal_preferencial !== undefined ? canal_preferencial : null]
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

async function saveUnitContact(req, res) {
  const { id } = req.params; // supplier_id
  const { unit_id, contact_name, phone, email, delivery_days } = req.body;
  if (!unit_id) return res.status(400).json({ error: 'unit_id é obrigatório.' });
  const result = await pool.query(
    `INSERT INTO supplier_unit_contacts (supplier_id, unit_id, contact_name, phone, email, delivery_days)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (supplier_id, unit_id) DO UPDATE SET
       contact_name = $3, phone = $4, email = $5, delivery_days = $6
     RETURNING *`,
    [id, unit_id, contact_name || null, phone || null, email || null, delivery_days || []]
  );
  res.json(result.rows[0]);
}

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, toggleActive, savePrice, deletePrice, getQuotationPrices, saveUnitContact };
