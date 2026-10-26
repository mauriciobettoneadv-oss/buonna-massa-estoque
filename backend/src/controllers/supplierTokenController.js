const pool = require('../db/pool');
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(16).toString('hex'); // 32-char hex
}

// POST /api/quotations/:id/suppliers/:supplierId/token
// Gera (ou regenera) o token de acesso do fornecedor
async function generateSupplierToken(req, res) {
  const { supplierId } = req.params;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  const result = await pool.query(
    `UPDATE quotation_suppliers
     SET access_token = $1, token_expires_at = $2
     WHERE id = $3
     RETURNING id, name, access_token, token_expires_at`,
    [token, expiresAt, supplierId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
  res.json(result.rows[0]);
}

// GET /api/cotacao/:token — rota PÚBLICA, sem autenticação
// Retorna os dados da cotação para o fornecedor
async function getQuotationByToken(req, res) {
  const { token } = req.params;

  const qs = await pool.query(
    `SELECT qs.id, qs.name, qs.quotation_id, qs.token_expires_at
     FROM quotation_suppliers qs
     WHERE qs.access_token = $1`,
    [token]
  );

  if (!qs.rows.length) return res.status(404).json({ error: 'Link inválido ou expirado.' });

  const supplier = qs.rows[0];

  if (supplier.token_expires_at && new Date(supplier.token_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este link expirou. Solicite um novo link à pizzaria.' });
  }

  const quotationId = supplier.quotation_id;

  // Produtos que precisam ser cotados
  const products = await pool.query(
    `SELECT p.id AS product_id, p.name, p.purchase_unit,
            agg.total_qty
     FROM products p
     JOIN (
       SELECT sci.product_id, SUM(sci.qty_to_buy) AS total_qty
       FROM quotation_counts qc
       JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
       WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0
       GROUP BY sci.product_id
     ) agg ON agg.product_id = p.id
     ORDER BY p.ordem ASC NULLS LAST, p.name ASC`,
    [quotationId]
  );

  // Preços já preenchidos por este fornecedor
  const prices = await pool.query(
    `SELECT product_id, unit_price, notes, alt_brand
     FROM quotation_prices
     WHERE supplier_id = $1`,
    [supplier.id]
  );

  const priceMap = {};
  for (const p of prices.rows) {
    priceMap[p.product_id] = { unit_price: Number(p.unit_price), notes: p.notes, alt_brand: p.alt_brand };
  }

  // Busca price_unit dos produtos
  const productIds = products.rows.map((p) => p.product_id);
  let priceUnitMap = {};
  if (productIds.length > 0) {
    const pu = await pool.query(
      `SELECT id, price_unit FROM products WHERE id = ANY($1::int[])`,
      [productIds]
    );
    for (const row of pu.rows) priceUnitMap[row.id] = row.price_unit;
  }

  res.json({
    supplier_name: supplier.name,
    expires_at: supplier.token_expires_at,
    products: products.rows.map((p) => ({
      product_id: p.product_id,
      name: p.name,
      purchase_unit: p.purchase_unit,
      price_unit: priceUnitMap[p.product_id] || null,
      total_qty: Number(p.total_qty),
      current_price: priceMap[p.product_id]?.unit_price ?? null,
      current_notes: priceMap[p.product_id]?.notes ?? null,
      current_alt_brand: priceMap[p.product_id]?.alt_brand ?? null,
    })),
  });
}

// POST /api/cotacao/:token/precos — rota PÚBLICA
// Salva os preços enviados pelo fornecedor
async function saveQuotationByToken(req, res) {
  const { token } = req.params;
  const { prices } = req.body; // [{ product_id, unit_price, unavailable }]

  if (!prices || !Array.isArray(prices)) {
    return res.status(400).json({ error: 'prices é obrigatório.' });
  }

  const qs = await pool.query(
    `SELECT id, token_expires_at FROM quotation_suppliers WHERE access_token = $1`,
    [token]
  );

  if (!qs.rows.length) return res.status(404).json({ error: 'Link inválido.' });

  const supplier = qs.rows[0];
  if (supplier.token_expires_at && new Date(supplier.token_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link expirado.' });
  }

  const supplierId = supplier.id;

  for (const { product_id, unit_price, unavailable, notes, alt_brand } of prices) {
    const price = unavailable ? 0 : Number(unit_price) || 0;
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price, notes, alt_brand)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3, notes = $4, alt_brand = $5`,
      [supplierId, product_id, price, notes || null, alt_brand || null]
    );
  }

  res.json({ ok: true });
}

module.exports = { generateSupplierToken, getQuotationByToken, saveQuotationByToken };
