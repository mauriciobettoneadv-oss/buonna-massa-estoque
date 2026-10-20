const pool = require('../db/pool');

async function extractFromImage(req, res) {
  const { image_base64, image_type, itens } = req.body;
  if (!image_base64 || !itens || !itens.length) {
    return res.status(400).json({ error: 'Imagem e itens são obrigatórios.' });
  }

  const productList = itens.map(i => `- ${i.name} | unidade: ${i.purchase_unit} | qtd pedida: ${i.qty_pedida} | preço acordado: R$${Number(i.preco_acordado).toFixed(2)}`).join('\n');

  const prompt = `Você é um assistente que confere notas fiscais e pedidos de uma pizzaria brasileira.

Analise a IMAGEM fornecida (nota fiscal, cupom ou documento de entrega) e extraia os dados reais recebidos.

PRODUTOS ESPERADOS NO PEDIDO:
${productList}

Para cada produto encontrado na nota, retorne:
- product_id: o ID do produto (do campo "ID:" na lista acima, ou null se não encontrado)
- name: nome como aparece na nota
- qty_recebida: quantidade recebida/cobrada na nota (número)
- valor_cobrado: preço unitário cobrado na nota (número decimal, em reais, sem R$)

REGRAS:
- Se um produto do pedido não aparecer na nota, não inclua (o usuário vai preencher manualmente)
- Se aparecer na nota mas não no pedido, ignore
- Preços devem ser por UNIDADE (não total)
- Se a nota mostrar total e quantidade, divida: valor_cobrado = total / quantidade
- Use pontos para decimais (12.50), não vírgulas

Responda APENAS com JSON válido, sem texto antes ou depois:
[{"product_id": 1, "name": "nome na nota", "qty_recebida": 10, "valor_cobrado": 12.50}]`;

  const body = {
    model: 'google/gemini-2.5-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${image_type || 'image/jpeg'};base64,${image_base64}` } }
      ]
    }],
    max_tokens: 2000,
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    return res.status(502).json({ error: `Erro na IA: ${JSON.stringify(errData)}` });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const jsonStr = text.trim().match(/\[[\s\S]*\]/)?.[0];
  if (!jsonStr) return res.status(422).json({ error: 'IA não retornou dados válidos.' });

  let extracted;
  try { extracted = JSON.parse(jsonStr); } catch {
    return res.status(422).json({ error: 'Erro ao interpretar resposta da IA.' });
  }

  // Match extracted items to the itens list by product_id
  const result = itens.map(item => {
    const found = extracted.find(e => e.product_id === item.product_id || e.product_id === Number(item.product_id));
    if (!found) return item;
    return {
      ...item,
      qty_recebida: found.qty_recebida ?? item.qty_recebida,
      valor_cobrado: found.valor_cobrado ?? item.valor_cobrado,
    };
  });

  res.json({ itens: result, extracted });
}

async function listConferencias(req, res) {
  const result = await pool.query(
    `SELECT cp.*, q.status AS quotation_status,
            u.name AS criado_por_name,
            array_agg(DISTINCT un.name) AS units
     FROM conferencia_pedido cp
     JOIN quotations q ON q.id = cp.quotation_id
     JOIN quotation_counts qc ON qc.quotation_id = q.id
     JOIN stock_counts sc ON sc.id = qc.stock_count_id
     JOIN units un ON un.id = sc.unit_id
     LEFT JOIN users u ON u.id = cp.criado_por
     GROUP BY cp.id, q.status, u.name
     ORDER BY cp.id DESC`
  );
  res.json(result.rows);
}

async function createConferencia(req, res) {
  const { quotation_id, itens } = req.body;
  const result = await pool.query(
    `INSERT INTO conferencia_pedido (quotation_id, criado_por, itens)
     VALUES ($1, $2, $3) RETURNING *`,
    [quotation_id, req.user.id, JSON.stringify(itens || [])]
  );
  res.status(201).json(result.rows[0]);
}

async function getConferencia(req, res) {
  const { id } = req.params;
  const result = await pool.query(`SELECT * FROM conferencia_pedido WHERE id = $1`, [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Não encontrada.' });
  res.json(result.rows[0]);
}

async function updateConferencia(req, res) {
  const { id } = req.params;
  const { itens, status } = req.body;
  const result = await pool.query(
    `UPDATE conferencia_pedido SET itens = COALESCE($1, itens), status = COALESCE($2, status)
     WHERE id = $3 RETURNING *`,
    [itens ? JSON.stringify(itens) : null, status, id]
  );
  res.json(result.rows[0]);
}

module.exports = { listConferencias, createConferencia, getConferencia, updateConferencia, extractFromImage };
