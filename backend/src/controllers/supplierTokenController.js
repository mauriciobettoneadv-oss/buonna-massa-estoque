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
    `SELECT DISTINCT ON (p.id)
            p.id AS product_id, p.name, p.purchase_unit,
            SUM(sci.qty_to_buy) OVER (PARTITION BY p.id) AS total_qty
     FROM quotation_counts qc
     JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
     JOIN products p ON p.id = sci.product_id
     WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0
     ORDER BY p.id, p.ordem ASC NULLS LAST`,
    [quotationId]
  );

  // Preços já preenchidos por este fornecedor
  const prices = await pool.query(
    `SELECT product_id, unit_price
     FROM quotation_prices
     WHERE supplier_id = $1`,
    [supplier.id]
  );

  const priceMap = {};
  for (const p of prices.rows) {
    priceMap[p.product_id] = Number(p.unit_price);
  }

  res.json({
    supplier_name: supplier.name,
    expires_at: supplier.token_expires_at,
    products: products.rows.map((p) => ({
      product_id: p.product_id,
      name: p.name,
      purchase_unit: p.purchase_unit,
      total_qty: Number(p.total_qty),
      current_price: priceMap[p.product_id] ?? null,
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

  for (const { product_id, unit_price, unavailable } of prices) {
    const price = unavailable ? 0 : Number(unit_price) || 0;
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3`,
      [supplierId, product_id, price]
    );
  }

  res.json({ ok: true });
}

module.exports = { generateSupplierToken, getQuotationByToken, saveQuotationByToken };
