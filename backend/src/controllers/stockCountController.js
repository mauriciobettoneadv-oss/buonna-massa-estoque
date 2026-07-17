const pool = require('../db/pool');
const { getSettings, sendToRecipients } = require('../services/whatsappService');

function computeQtyToBuy(minStock, currentStock) {
  const diff = Number(minStock) - Number(currentStock);
  return diff > 0 ? diff : 0;
}

async function startOrGetOpenCount(req, res) {
  const { unit_id } = req.body;
  if (!unit_id) return res.status(400).json({ error: 'unit_id é obrigatório.' });

  // Retorna qualquer contagem não finalizada do dia
  const existing = await pool.query(
    `SELECT * FROM stock_counts
     WHERE unit_id = $1 AND status IN ('aberta', 'salva')
     ORDER BY created_at DESC LIMIT 1`,
    [unit_id]
  );
  if (existing.rows.length > 0) return res.json(existing.rows[0]);

  const result = await pool.query(
    `INSERT INTO stock_counts (unit_id, created_by) VALUES ($1, $2) RETURNING *`,
    [unit_id, req.user.id]
  );
  res.status(201).json(result.rows[0]);
}

async function getCount(req, res) {
  const { id } = req.params;

  const countResult = await pool.query(
    `SELECT sc.*,
            cb.name AS created_by_name,
            sb.name AS saved_by_name,
            fb.name AS finalized_by_name
     FROM stock_counts sc
     LEFT JOIN users cb ON cb.id = sc.created_by
     LEFT JOIN users sb ON sb.id = sc.saved_by
     LEFT JOIN users fb ON fb.id = sc.finalized_by
     WHERE sc.id = $1`,
    [id]
  );
  if (countResult.rows.length === 0) return res.status(404).json({ error: 'Contagem não encontrada.' });

  const itemsResult = await pool.query(
    `SELECT p.id AS product_id, p.name, p.category, p.unit_measure, p.purchase_unit, p.min_stock,
            COALESCE(sci.current_stock, 0) AS current_stock,
            COALESCE(sci.qty_to_buy, 0) AS qty_to_buy
     FROM products p
     LEFT JOIN stock_count_items sci
       ON sci.product_id = p.id AND sci.stock_count_id = $1
     WHERE p.active = TRUE
     ORDER BY p.ordem ASC NULLS LAST`,
    [id]
  );

  res.json({ count: countResult.rows[0], items: itemsResult.rows });
}

async function saveItem(req, res) {
  const { id } = req.params;
  const { product_id, current_stock } = req.body;
  let { qty_to_buy } = req.body;

  if (product_id === undefined || current_stock === undefined) {
    return res.status(400).json({ error: 'product_id e current_stock são obrigatórios.' });
  }

  const countResult = await pool.query('SELECT * FROM stock_counts WHERE id = $1', [id]);
  if (countResult.rows.length === 0) return res.status(404).json({ error: 'Contagem não encontrada.' });

  const { status } = countResult.rows[0];
  if (status === 'finalizada') {
    return res.status(400).json({ error: 'Esta contagem já foi finalizada e não pode ser editada.' });
  }

  if (qty_to_buy === undefined) {
    const productResult = await pool.query('SELECT min_stock FROM products WHERE id = $1', [product_id]);
    if (productResult.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    qty_to_buy = computeQtyToBuy(productResult.rows[0].min_stock, current_stock);
  }

  const result = await pool.query(
    `INSERT INTO stock_count_items (stock_count_id, product_id, current_stock, qty_to_buy)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stock_count_id, product_id)
     DO UPDATE SET current_stock = $3, qty_to_buy = $4
     RETURNING *`,
    [id, product_id, current_stock, qty_to_buy]
  );

  res.json(result.rows[0]);
}

// Etapa 1: Contador salva a contagem (status aberta → salva)
async function saveCount(req, res) {
  const { id } = req.params;

  const countResult = await pool.query(
    `SELECT sc.*, u.name AS unit_name FROM stock_counts sc JOIN units u ON u.id = sc.unit_id WHERE sc.id = $1`,
    [id]
  );
  if (countResult.rows.length === 0) return res.status(404).json({ error: 'Contagem não encontrada.' });

  const count = countResult.rows[0];
  if (count.status === 'finalizada') {
    return res.status(400).json({ error: 'Esta contagem já foi finalizada.' });
  }

  const updated = await pool.query(
    `UPDATE stock_counts SET status = 'salva', saved_by = $1, saved_at = NOW()
     WHERE id = $2 RETURNING *`,
    [req.user.id, id]
  );

  // Dispara WhatsApp para Donos e Gerentes (não bloqueia a resposta)
  notifyDonos(req.user, count).catch(err => console.error('[whatsapp] saveCount notify error:', err.message));

  res.json(updated.rows[0]);
}

async function notifyDonos(actor, count) {
  const recipients = await pool.query(
    `SELECT name, whatsapp FROM users WHERE role IN ('dono', 'proprietario', 'gerente') AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );
  if (recipients.rows.length === 0) return;

  const systemUrl = process.env.SYSTEM_URL || 'https://buonna-massa-estoque.vercel.app';
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  const message =
    `📋 *Buonna Massa – ${count.unit_name}*\n` +
    `A contagem de estoque foi salva por ${actor.name} às ${hora}.\n` +
    `Acesse o sistema para preencher as quantidades de compra e finalizar: ${systemUrl}`;

  await sendToRecipients(recipients.rows, 'contagem_salva', message);
}

// Etapa 2: Dono/Gerente finaliza (status salva → finalizada)
async function finalizeCount(req, res) {
  const result = await pool.query(
    `UPDATE stock_counts SET status = 'finalizada', finalized_by = $1, finalized_at = NOW()
     WHERE id = $2 AND status = 'salva' RETURNING *`,
    [req.user.id, req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Contagem não encontrada ou não está aguardando finalização. Salve a contagem primeiro.' });
  }
  res.json(result.rows[0]);
}

async function getReport(req, res) {
  const { id } = req.params;

  const countResult = await pool.query(
    `SELECT sc.*, u.name AS unit_name FROM stock_counts sc
     JOIN units u ON u.id = sc.unit_id WHERE sc.id = $1`,
    [id]
  );
  if (countResult.rows.length === 0) return res.status(404).json({ error: 'Contagem não encontrada.' });

  const itemsResult = await pool.query(
    `SELECT p.name, p.category, p.unit_measure, p.purchase_unit, sci.current_stock, sci.qty_to_buy
     FROM stock_count_items sci
     JOIN products p ON p.id = sci.product_id
     WHERE sci.stock_count_id = $1 AND sci.qty_to_buy > 0
     ORDER BY p.ordem ASC NULLS LAST`,
    [id]
  );

  res.json({ count: countResult.rows[0], items: itemsResult.rows });
}

module.exports = { startOrGetOpenCount, getCount, saveItem, saveCount, finalizeCount, getReport };
