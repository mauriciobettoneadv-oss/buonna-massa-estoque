const pool = require('../db/pool');
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(16).toString('hex'); // 32-char hex
}

function computeMultiplier(priceUnit, purchaseUnit, boxQty, boxUnitWeight) {
  const pu = (priceUnit || '').toLowerCase().trim();
  const bu = (purchaseUnit || '').toLowerCase().trim();
  if (!pu || pu === bu) return 1;
  const isBox = ['caixa', 'fardo'].includes(bu);
  const qty = isBox ? (Number(boxQty) || 1) : 1;
  const weight = Number(boxUnitWeight) || 1;
  return pu === 'kilo' ? qty * weight : (isBox ? qty : 1);
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

  // Produtos que precisam ser cotados (inclui campos para cálculo de multiplier)
  const products = await pool.query(
    `SELECT p.id AS product_id, p.name, p.purchase_unit, p.price_unit, p.box_qty, p.box_unit_weight,
            agg.total_qty
     FROM products p
     JOIN (
       SELECT sci.product_id, SUM(sci.qty_to_buy) AS total_qty
       FROM quotation_counts qc
       JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
       WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0
       GROUP BY sci.product_id
     ) agg ON agg.product_id = p.id
     ORDER BY p.ordem ASC NULLS LAST, p.id ASC`,
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

  res.json({
    supplier_name: supplier.name,
    expires_at: supplier.token_expires_at,
    products: products.rows.map((p) => {
      const mult = computeMultiplier(p.price_unit, p.purchase_unit, p.box_qty, p.box_unit_weight);
      const storedPrice = priceMap[p.product_id]?.unit_price ?? null;
      return {
        product_id: p.product_id,
        name: p.name,
        purchase_unit: p.purchase_unit,
        multiplier: mult,
        total_qty: Number(p.total_qty),
        // Converte preço armazenado (R$/price_unit) para R$/purchase_unit para exibição
        current_price: storedPrice != null ? storedPrice * mult : null,
        current_notes: priceMap[p.product_id]?.notes ?? null,
        current_alt_brand: priceMap[p.product_id]?.alt_brand ?? null,
      };
    }),
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

  // Busca multipliers dos produtos para converter R$/purchase_unit → R$/price_unit no armazenamento
  const productIds = prices.map((p) => p.product_id).filter(Boolean);
  let multMap = {};
  if (productIds.length > 0) {
    const pRows = await pool.query(
      `SELECT id, price_unit, purchase_unit, box_qty, box_unit_weight FROM products WHERE id = ANY($1::int[])`,
      [productIds]
    );
    for (const row of pRows.rows) {
      multMap[row.id] = computeMultiplier(row.price_unit, row.purchase_unit, row.box_qty, row.box_unit_weight);
    }
  }

  for (const { product_id, unit_price, unavailable, notes, alt_brand } of prices) {
    const mult = multMap[product_id] || 1;
    // Fornecedor informa R$/purchase_unit; armazenamos R$/price_unit
    const enteredPrice = unavailable ? 0 : Number(unit_price) || 0;
    const storedPrice = enteredPrice > 0 ? enteredPrice / mult : 0;
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price, notes, alt_brand)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3, notes = $4, alt_brand = $5`,
      [supplierId, product_id, storedPrice, notes || null, alt_brand || null]
    );
  }

  res.json({ ok: true });
}

module.exports = { generateSupplierToken, getQuotationByToken, saveQuotationByToken };
