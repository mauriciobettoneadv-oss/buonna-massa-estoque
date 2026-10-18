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
  const countId = req.params.id;
  const result = await pool.query(
    `UPDATE stock_counts SET status = 'finalizada', finalized_by = $1, finalized_at = NOW()
     WHERE id = $2 AND status = 'salva'
     RETURNING *, (SELECT name FROM units WHERE id = unit_id) AS unit_name`,
    [req.user.id, countId]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Contagem não encontrada ou não está aguardando finalização. Salve a contagem primeiro.' });
  }

  const count = result.rows[0];

  // Disparo de cotação automática (não bloqueia a resposta)
  dispatchQuotation(count).catch(err => console.error('[quotation] dispatch error:', err.message));

  res.json(count);
}

async function dispatchQuotation(count) {
  const { getSettings, sendMessage } = require('../services/whatsappService');
  const crypto = require('crypto');

  const settings = await getSettings();
  if (!settings?.auto_send_quotation) return;

  // 1. Verificar se já existe cotação para esta contagem
  let quotationId;
  const existingQC = await pool.query(
    `SELECT qc.quotation_id FROM quotation_counts qc
     JOIN quotations q ON q.id = qc.quotation_id
     WHERE qc.stock_count_id = $1 AND q.status != 'finalizada'
     LIMIT 1`,
    [count.id]
  );

  if (existingQC.rows.length > 0) {
    quotationId = existingQC.rows[0].quotation_id;
  } else {
    // 2. Criar nova cotação
    const newQ = await pool.query(
      `INSERT INTO quotations (created_by, status) VALUES ($1, 'aberta') RETURNING id`,
      [count.finalized_by]
    );
    quotationId = newQ.rows[0].id;
    await pool.query(
      `INSERT INTO quotation_counts (quotation_id, stock_count_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [quotationId, count.id]
    );
  }

  // 3. Buscar fornecedores ativos
  const suppliers = await pool.query(
    `SELECT s.id, s.name,
            suc.contact_name, suc.phone
     FROM suppliers s
     LEFT JOIN supplier_unit_contacts suc ON suc.supplier_id = s.id AND suc.unit_id = $1
     WHERE s.active = TRUE`,
    [count.unit_id]
  );

  const systemUrl = process.env.SYSTEM_URL || 'https://buonna-massa-estoque.vercel.app';
  const deadlineHour = settings.quotation_deadline_hour || 18;
  const template = settings.quotation_msg_template ||
    'Olá, {contact_name}! 🍕\nSou da Pizzaria Buonna Massa – {unit_name}.\nSegue o link para preenchimento da cotação desta semana:\n{link}\nAguardamos o preenchimento até {deadline}.\nObrigado!';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const deadlineStr = `${tomorrow.toLocaleDateString('pt-BR')} às ${deadlineHour}h`;

  for (const sup of suppliers.rows) {
    // 4. Garantir quotation_supplier e gerar token
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Insert or update quotation_supplier entry
    let qs;
    const existQS = await pool.query(
      `SELECT id FROM quotation_suppliers WHERE quotation_id = $1 AND supplier_id = $2 LIMIT 1`,
      [quotationId, sup.id]
    );
    if (existQS.rows.length > 0) {
      qs = await pool.query(
        `UPDATE quotation_suppliers SET access_token = $1, token_expires_at = $2 WHERE id = $3 RETURNING id, access_token`,
        [token, expiresAt, existQS.rows[0].id]
      );
    } else {
      qs = await pool.query(
        `INSERT INTO quotation_suppliers (quotation_id, supplier_id, name, access_token, token_expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, access_token`,
        [quotationId, sup.id, sup.name, token, expiresAt]
      );
    }

    const qsToken = qs.rows[0].access_token;
    const phone = sup.phone; // from supplier_unit_contacts
    if (!phone) continue;

    const link = `${systemUrl}/cotacao/${qsToken}`;
    const contactName = sup.contact_name || sup.name;

    const message = template
      .replace('{contact_name}', contactName)
      .replace('{unit_name}', count.unit_name)
      .replace('{link}', link)
      .replace('{deadline}', deadlineStr);

    try {
      await sendMessage(phone, message, settings);
      console.log(`[quotation] Enviado para ${sup.name} (${phone})`);
    } catch (err) {
      console.error(`[quotation] Erro ao enviar para ${sup.name}:`, err.message);
    }
  }
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

async function getHistory(req, res) {
  const result = await pool.query(
    `SELECT sc.id, sc.status, sc.created_at, sc.finalized_at, sc.saved_at,
            u.name AS unit_name,
            cb.name AS created_by_name,
            sb.name AS saved_by_name,
            fb.name AS finalized_by_name,
            COUNT(sci.id) FILTER (WHERE sci.qty_to_buy > 0) AS items_to_buy,
            COUNT(sci.id) FILTER (WHERE sci.current_stock IS NOT NULL) AS items_counted
     FROM stock_counts sc
     JOIN units u ON u.id = sc.unit_id
     LEFT JOIN users cb ON cb.id = sc.created_by
     LEFT JOIN users sb ON sb.id = sc.saved_by
     LEFT JOIN users fb ON fb.id = sc.finalized_by
     LEFT JOIN stock_count_items sci ON sci.stock_count_id = sc.id
     GROUP BY sc.id, u.name, cb.name, sb.name, fb.name
     ORDER BY sc.id DESC`
  );
  res.json(result.rows);
}

async function getSuggestions(req, res) {
  const { unitId } = req.params;
  const result = await pool.query(
    `SELECT sci.product_id,
            ROUND(AVG(sci.qty_to_buy)::numeric, 2) AS avg_qty,
            COUNT(*) AS n_counts
     FROM stock_count_items sci
     JOIN stock_counts sc ON sc.id = sci.stock_count_id
     WHERE sc.unit_id = $1 AND sc.status = 'finalizada' AND sci.qty_to_buy > 0
       AND sc.id IN (
         SELECT id FROM stock_counts
         WHERE unit_id = $1 AND status = 'finalizada'
         ORDER BY id DESC LIMIT 4
       )
     GROUP BY sci.product_id`,
    [unitId]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.product_id] = { avg_qty: Number(row.avg_qty), n_counts: Number(row.n_counts) };
  }
  res.json(map);
}

module.exports = { startOrGetOpenCount, getCount, saveItem, saveCount, finalizeCount, getReport, getHistory, getSuggestions };
