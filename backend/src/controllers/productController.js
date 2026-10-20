const pool = require('../db/pool');

const CATEGORIES = [
  'Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Escritório', 'Outros',
];

async function listProducts(req, res) {
  const includeInactive = req.query.includeInactive === 'true';
  const query = includeInactive
    ? 'SELECT * FROM products ORDER BY ordem ASC NULLS LAST'
    : 'SELECT * FROM products WHERE active = TRUE ORDER BY ordem ASC NULLS LAST';
  const result = await pool.query(query);
  res.json(result.rows);
}

async function createProduct(req, res) {
  const {
    name, category, unit_measure, purchase_unit,
    min_stock_sao_pedro, min_stock_piracicaba,
    supplier, box_qty, box_unit_weight, price_unit, price_per_package,
  } = req.body;

  if (!name || !category || !unit_measure || !purchase_unit) {
    return res.status(400).json({
      error: 'Nome, categoria, unidade de contagem e unidade de compra são obrigatórios.',
    });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  const result = await pool.query(
    `INSERT INTO products (name, category, unit_measure, purchase_unit,
       min_stock_sao_pedro, min_stock_piracicaba,
       supplier, box_qty, box_unit_weight, price_unit, price_per_package)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [name, category, unit_measure, purchase_unit,
     min_stock_sao_pedro || 0, min_stock_piracicaba || 0,
     supplier || null, box_qty || null, box_unit_weight || null,
     price_unit || null, price_per_package || null]
  );
  res.status(201).json(result.rows[0]);
}

async function updateProduct(req, res) {
  const { id } = req.params;
  const {
    name, category, unit_measure, purchase_unit,
    min_stock_sao_pedro, min_stock_piracicaba,
    supplier, box_qty, box_unit_weight, price_unit, price_per_package,
  } = req.body;

  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  const result = await pool.query(
    `UPDATE products SET
       name = COALESCE($1, name),
       category = COALESCE($2, category),
       unit_measure = COALESCE($3, unit_measure),
       purchase_unit = COALESCE($4, purchase_unit),
       min_stock_sao_pedro = COALESCE($5, min_stock_sao_pedro),
       min_stock_piracicaba = COALESCE($6, min_stock_piracicaba),
       supplier = COALESCE($7, supplier),
       box_qty = $8,
       box_unit_weight = $9,
       price_unit = $10,
       price_per_package = $11
     WHERE id = $12 RETURNING *`,
    [name, category, unit_measure, purchase_unit,
     min_stock_sao_pedro, min_stock_piracicaba, supplier,
     box_qty || null, box_unit_weight || null, price_unit || null,
     price_per_package || null, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json(result.rows[0]);
}

async function setActive(req, res) {
  const { id } = req.params;
  const { active } = req.body;

  const result = await pool.query(
    'UPDATE products SET active = $1 WHERE id = $2 RETURNING *',
    [Boolean(active), id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json(result.rows[0]);
}

module.exports = { listProducts, createProduct, updateProduct, setActive, CATEGORIES };
