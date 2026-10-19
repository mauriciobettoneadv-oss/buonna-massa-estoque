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

module.exports = { listEntregas, createEntrega, getEntrega, finalizeEntrega };
