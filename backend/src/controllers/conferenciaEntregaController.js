const pool = require('../db/pool');
const { getSettings, sendToRecipients } = require('../services/whatsappService');

async function listEntregas(req, res) {
  const result = await pool.query(
    `SELECT ce.*, cp.quotation_id, u.name AS conferente_name
     FROM conferencia_entrega ce
     LEFT JOIN conferencia_pedido cp ON cp.id = ce.conferencia_pedido_id
     LEFT JOIN users u ON u.id = ce.conferente_id
     ORDER BY ce.id DESC`
  );
  res.json(result.rows);
}

async function createEntrega(req, res) {
  const { conferencia_pedido_id } = req.body;
  const cp = await pool.query(`SELECT * FROM conferencia_pedido WHERE id = $1`, [conferencia_pedido_id]);
  if (!cp.rows.length) return res.status(404).json({ error: 'Conferência de pedido não encontrada.' });
  const itens = (cp.rows[0].itens || []).map(item => ({
    ...item,
    status: 'ok',
    qtd_recebida: item.qtd_pedida,
    valor_recebido: item.valor_pedido,
    observacao: '',
  }));
  const result = await pool.query(
    `INSERT INTO conferencia_entrega (conferencia_pedido_id, conferente_id, itens)
     VALUES ($1, $2, $3) RETURNING *`,
    [conferencia_pedido_id, req.user.id, JSON.stringify(itens)]
  );
  res.status(201).json(result.rows[0]);
}

async function getEntrega(req, res) {
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM conferencia_entrega WHERE id = $1`, [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Não encontrada.' });
  res.json(result.rows[0]);
}

async function finalizeEntrega(req, res) {
  const { id } = req.params;
  const { itens } = req.body;

  const temDivergencia = itens.some(i => i.status !== 'ok');
  const status = temDivergencia ? 'divergente' : 'ok';

  const result = await pool.query(
    `UPDATE conferencia_entrega
     SET itens = $1, status = $2, finalizado_em = NOW(), conferente_id = $3
     WHERE id = $4 RETURNING *`,
    [JSON.stringify(itens), status, req.user.id, id]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Não encontrada.' });

  if (temDivergencia) {
    try {
      const donos = await pool.query(
        `SELECT name, whatsapp FROM users WHERE role IN ('dono','proprietario') AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
      );
      if (donos.rows.length > 0) {
        const itensDivergentes = itens.filter(i => i.status !== 'ok');
        const listaProblemas = itensDivergentes.map(i => {
          if (i.status === 'nao_entregue') return `• ${i.nome}: Não entregue`;
          if (i.status === 'qtd_errada') return `• ${i.nome}: Qtd esperada ${i.qtd_pedida}, recebida ${i.qtd_recebida}`;
          if (i.status === 'preco_divergente') return `• ${i.nome}: Valor esperado R$${i.valor_pedido}, cobrado R$${i.valor_recebido}`;
          return `• ${i.nome}: Divergência`;
        }).join('\n');
        const msg = `⚠️ Divergência na entrega\nItens com problema:\n${listaProblemas}`;
        await sendToRecipients(donos.rows, 'divergencia_entrega', msg);
      }
    } catch (err) {
      console.error('[entrega] erro WhatsApp:', err.message);
    }
  }

  res.json(result.rows[0]);
}

// Cria conferência de entrega direto de uma cotação (sem espelho prévio)
// Para fornecedores que não enviam espelho (Bressan, BRF, Ambev, Coca-Cola...)
async function createEntregaFromQuotation(req, res) {
  const { quotation_id, supplier_id, unit_id } = req.body;
  if (!quotation_id || !supplier_id) {
    return res.status(400).json({ error: 'quotation_id e supplier_id são obrigatórios.' });
  }

  // Busca dados da cotação
  const q = await pool.query(`SELECT * FROM quotations WHERE id = $1`, [quotation_id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Cotação não encontrada.' });

  // Fornecedor na cotação
  const qs = await pool.query(`SELECT * FROM quotation_suppliers WHERE id = $1 AND quotation_id = $2`, [supplier_id, quotation_id]);
  if (!qs.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado nesta cotação.' });
  const supplier = qs.rows[0];

  // Produtos com preços desse fornecedor na cotação
  const prices = await pool.query(
    `SELECT qp.product_id, qp.unit_price, p.name, p.purchase_unit, p.price_unit,
            p.box_qty, p.box_unit_weight
     FROM quotation_prices qp
     JOIN products p ON p.id = qp.product_id
     WHERE qp.supplier_id = $1 AND qp.unit_price > 0
     ORDER BY p.name`,
    [supplier_id]
  );

  // Se tiver unit_id, filtra pela quantidade pedida para aquela unidade
  let qtyMap = {};
  if (unit_id) {
    const qtys = await pool.query(
      `SELECT sci.product_id, sci.qty_to_buy
       FROM quotation_counts qc
       JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
       JOIN stock_counts sc ON sc.id = qc.stock_count_id
       WHERE qc.quotation_id = $1 AND sc.unit_id = $2 AND sci.qty_to_buy > 0`,
      [quotation_id, unit_id]
    );
    for (const row of qtys.rows) qtyMap[row.product_id] = Number(row.qty_to_buy);
  } else {
    // Soma todas as unidades
    const qtys = await pool.query(
      `SELECT sci.product_id, SUM(sci.qty_to_buy) AS qty
       FROM quotation_counts qc
       JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
       WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0
       GROUP BY sci.product_id`,
      [quotation_id]
    );
    for (const row of qtys.rows) qtyMap[row.product_id] = Number(row.qty);
  }

  const itens = prices.rows
    .filter(p => qtyMap[p.product_id] > 0)
    .map(p => {
      // Multiplier: price_unit → purchase_unit
      const pu = (p.price_unit || '').toLowerCase().trim();
      const bu = (p.purchase_unit || '').toLowerCase().trim();
      let mult = 1;
      if (pu && pu !== bu) {
        const isBox = ['caixa', 'fardo'].includes(bu);
        const bq = isBox ? (Number(p.box_qty) || 1) : 1;
        const bw = Number(p.box_unit_weight) || 1;
        mult = pu === 'kilo' ? bq * bw : (isBox ? bq : 1);
      }
      const precoPorCompra = Number(p.unit_price) * mult;
      return {
        product_id: p.product_id,
        nome: p.name,
        purchase_unit: p.purchase_unit,
        qtd_pedida: qtyMap[p.product_id] || 0,
        valor_pedido: precoPorCompra,
        qtd_recebida: qtyMap[p.product_id] || 0,
        valor_recebido: precoPorCompra,
        status: 'ok',
        observacao: '',
      };
    });

  const result = await pool.query(
    `INSERT INTO conferencia_entrega (quotation_id, supplier_name, unit_id, conferente_id, itens)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [quotation_id, supplier.name, unit_id || null, req.user.id, JSON.stringify(itens)]
  );
  res.status(201).json(result.rows[0]);
}

module.exports = { listEntregas, createEntrega, getEntrega, finalizeEntrega, createEntregaFromQuotation };
