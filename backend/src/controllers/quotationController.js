const pool = require('../db/pool');

async function listQuotations(req, res) {
  const result = await pool.query(
    `SELECT q.id, q.status, q.created_at,
            array_agg(DISTINCT u.name) AS units
     FROM quotations q
     JOIN quotation_counts qc ON qc.quotation_id = q.id
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units u ON u.id = sc.unit_id
     GROUP BY q.id ORDER BY q.id DESC`
  );
  res.json(result.rows);
}

async function createQuotation(req, res) {
  const { count_ids } = req.body;
  if (!count_ids || !count_ids.length) {
    return res.status(400).json({ error: 'count_ids é obrigatório.' });
  }

  const q = await pool.query(
    `INSERT INTO quotations (created_by) VALUES ($1) RETURNING *`,
    [req.user.id]
  );
  const quotationId = q.rows[0].id;

  for (const countId of count_ids) {
    await pool.query(
      `INSERT INTO quotation_counts (quotation_id, stock_count_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [quotationId, countId]
    );
  }

  res.status(201).json(q.rows[0]);
}

async function getQuotation(req, res) {
  const { id } = req.params;

  const quotation = await pool.query(`SELECT * FROM quotations WHERE id = $1`, [id]);
  if (!quotation.rows.length) return res.status(404).json({ error: 'Cotação não encontrada.' });

  // Counts linked with unit info
  const counts = await pool.query(
    `SELECT sc.id, sc.status, u.id AS unit_id, u.name AS unit_name
     FROM quotation_counts qc
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units u ON u.id = sc.unit_id
     WHERE qc.quotation_id = $1`,
    [id]
  );

  // All products that need to be bought across all linked counts
  const products = await pool.query(
    `SELECT DISTINCT ON (p.id)
            p.id AS product_id, p.name, p.category, p.unit_measure, p.purchase_unit, p.min_stock
     FROM quotation_counts qc
     JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
     JOIN products p ON p.id = sci.product_id
     WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0
     ORDER BY p.id, p.ordem ASC NULLS LAST`,
    [id]
  );

  // qty_to_buy per product per unit
  const qtys = await pool.query(
    `SELECT p.id AS product_id, u.id AS unit_id, u.name AS unit_name, sci.qty_to_buy
     FROM quotation_counts qc
     JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
     JOIN products p ON p.id = sci.product_id
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units u ON u.id = sc.unit_id
     WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0`,
    [id]
  );

  // Suppliers
  const suppliers = await pool.query(
    `SELECT * FROM quotation_suppliers WHERE quotation_id = $1 ORDER BY id`,
    [id]
  );

  // Prices
  const prices = await pool.query(
    `SELECT qp.supplier_id, qp.product_id, qp.unit_price
     FROM quotation_prices qp
     JOIN quotation_suppliers qs ON qs.id = qp.supplier_id
     WHERE qs.quotation_id = $1`,
    [id]
  );

  // Build qty map: product_id -> { unit_id: qty }
  const qtyMap = {};
  for (const row of qtys.rows) {
    if (!qtyMap[row.product_id]) qtyMap[row.product_id] = {};
    qtyMap[row.product_id][row.unit_id] = Number(row.qty_to_buy);
  }

  // Attach qtys to products
  const productsWithQty = products.rows
    .map((p) => ({ ...p, qtys: qtyMap[p.product_id] || {} }))
    .sort((a, b) => (Number(a.product_id) || 0) - (Number(b.product_id) || 0));

  res.json({
    quotation: quotation.rows[0],
    counts: counts.rows,
    products: productsWithQty,
    suppliers: suppliers.rows,
    prices: prices.rows,
  });
}

async function addSupplier(req, res) {
  const { id } = req.params;
  const { name, supplier_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório.' });

  const result = await pool.query(
    `INSERT INTO quotation_suppliers (quotation_id, name, supplier_id) VALUES ($1, $2, $3) RETURNING *`,
    [id, name, supplier_id || null]
  );
  res.status(201).json(result.rows[0]);
}

async function deleteSupplier(req, res) {
  const { supplierId } = req.params;
  await pool.query(`DELETE FROM quotation_suppliers WHERE id = $1`, [supplierId]);
  res.json({ ok: true });
}

async function savePrices(req, res) {
  const { supplierId } = req.params;
  const { prices } = req.body; // [{ product_id, unit_price }]

  for (const { product_id, unit_price } of prices) {
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3`,
      [supplierId, product_id, unit_price || 0]
    );
  }

  // Sync to global supplier_product_prices if linked to a registered supplier
  const qs = await pool.query(`SELECT supplier_id FROM quotation_suppliers WHERE id = $1`, [supplierId]);
  const globalSupplierId = qs.rows[0]?.supplier_id;
  if (globalSupplierId) {
    for (const { product_id, unit_price } of prices) {
      if (Number(unit_price) > 0) {
        await pool.query(
          `INSERT INTO supplier_product_prices (supplier_id, product_id, unit_price, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3, updated_at = NOW()`,
          [globalSupplierId, product_id, unit_price]
        );
      }
    }
  }

  res.json({ ok: true });
}

async function getOrders(req, res) {
  const { id } = req.params;

  const quotation = await pool.query(`SELECT * FROM quotations WHERE id = $1`, [id]);
  if (!quotation.rows.length) return res.status(404).json({ error: 'Cotação não encontrada.' });

  const counts = await pool.query(
    `SELECT sc.id AS count_id, u.id AS unit_id, u.name AS unit_name
     FROM quotation_counts qc
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units u ON u.id = sc.unit_id
     WHERE qc.quotation_id = $1`,
    [id]
  );

  // Best price per product: lowest unit_price among all suppliers
  const bestPrices = await pool.query(
    `SELECT qp.product_id,
            MIN(qp.unit_price) AS best_price,
            (SELECT qs2.name FROM quotation_prices qp2
             JOIN quotation_suppliers qs2 ON qs2.id = qp2.supplier_id
             WHERE qp2.product_id = qp.product_id
               AND qs2.quotation_id = $1
               AND qp2.unit_price > 0
             ORDER BY qp2.unit_price ASC LIMIT 1) AS supplier_name
     FROM quotation_prices qp
     JOIN quotation_suppliers qs ON qs.id = qp.supplier_id
     WHERE qs.quotation_id = $1 AND qp.unit_price > 0
     GROUP BY qp.product_id`,
    [id]
  );

  const bestMap = {};
  for (const row of bestPrices.rows) {
    bestMap[row.product_id] = { best_price: Number(row.best_price), supplier_name: row.supplier_name };
  }

  // Build orders per unit
  const orders = [];
  for (const count of counts.rows) {
    const items = await pool.query(
      `SELECT p.id AS product_id, p.name, p.category, p.purchase_unit, sci.qty_to_buy
       FROM stock_count_items sci
       JOIN products p ON p.id = sci.product_id
       WHERE sci.stock_count_id = $1 AND sci.qty_to_buy > 0
       ORDER BY p.ordem ASC NULLS LAST`,
      [count.count_id]
    );

    const orderItems = items.rows.map((item) => {
      const best = bestMap[item.product_id];
      const qty = Number(item.qty_to_buy);
      const unit_price = best?.best_price || 0;
      return {
        ...item,
        qty_to_buy: qty,
        unit_price,
        total_price: qty * unit_price,
        supplier_name: best?.supplier_name || '—',
      };
    });

    // Group by supplier
    const bySupplier = {};
    for (const item of orderItems) {
      const s = item.supplier_name;
      if (!bySupplier[s]) bySupplier[s] = [];
      bySupplier[s].push(item);
    }

    orders.push({
      unit_id: count.unit_id,
      unit_name: count.unit_name,
      items: orderItems,
      by_supplier: bySupplier,
    });
  }

  res.json({ quotation: quotation.rows[0], orders });
}

module.exports = { listQuotations, createQuotation, getQuotation, addSupplier, deleteSupplier, savePrices, getOrders };
