const pool = require('../db/pool');

const CATEGORIES = [
  'Laticínios', 'Embutidos', 'Bebidas', 'Limpeza', 'Descartáveis', 'Massas', 'Molhos', 'Outros',
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
  const { name, category, unit_measure, purchase_unit, min_stock, supplier } = req.body;

  if (!name || !category || !unit_measure || !purchase_unit || min_stock === undefined) {
    return res.status(400).json({
      error: 'Nome, categoria, unidade de contagem, unidade de compra e estoque mínimo são obrigatórios.',
    });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  const result = await pool.query(
    `INSERT INTO products (name, category, unit_measure, purchase_unit, min_stock, supplier)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, category, unit_measure, purchase_unit, min_stock, supplier || null]
  );
  res.status(201).json(result.rows[0]);
}

async function updateProduct(req, res) {
  const { id } = req.params;
  const { name, category, unit_measure, purchase_unit, min_stock, supplier } = req.body;

  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  const result = await pool.query(
    `UPDATE products SET
       name = COALESCE($1, name),
       category = COALESCE($2, category),
       unit_measure = COALESCE($3, unit_measure),
       purchase_unit = COALESCE($4, purchase_unit),
       min_stock = COALESCE($5, min_stock),
       supplier = COALESCE($6, supplier)
     WHERE id = $7 RETURNING *`,
    [name, category, unit_measure, purchase_unit, min_stock, supplier, id]
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
