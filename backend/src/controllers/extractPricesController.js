const pool = require('../db/pool');
const fs = require('fs');

function similarity(a, b) {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.8;
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  const common = wordsA.filter((w) => wordsB.some((wb) => wb.includes(w) || w.includes(wb)));
  return common.length / Math.max(wordsA.length, wordsB.length);
}

async function extractPrices(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada no servidor.' });
  }

  const { id: quotationId, supplierId } = req.params;

  const productsResult = await pool.query(
    `SELECT DISTINCT p.id AS product_id, p.name, p.purchase_unit
     FROM quotation_counts qc
     JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
     JOIN products p ON p.id = sci.product_id
     WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0`,
    [quotationId]
  );
  const products = productsResult.rows;

  const imageBuffer = fs.readFileSync(req.file.path);
  const base64Image = imageBuffer.toString('base64');
  const mediaType = req.file.mimetype;

  const productList = products.map((p) => `- ${p.name} (${p.purchase_unit})`).join('\n');

  const prompt = `Esta é uma lista de preços de um fornecedor. Extraia todos os produtos e seus preços unitários visíveis na imagem.

Produtos que estou procurando (mas pode haver outros):
${productList}

Responda SOMENTE com um JSON válido no formato:
[{"produto": "nome exato como aparece na imagem", "preco": 12.50}, ...]

Regras:
- Use o preço unitário (por unidade/kg/caixa). Se houver preço por embalagem maior, divida.
- Números decimais com ponto (não vírgula).
- Se não encontrar preço para um produto, não inclua na lista.
- Retorne apenas o JSON, sem texto antes ou depois.`;

  let responseText;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-nano-12b-v2-vl:free',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Image}` } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if (response.status === 429) {
        fs.unlinkSync(req.file.path);
        return res.status(429).json({ error: 'Limite de requisições da IA atingido. Aguarde 1 minuto e tente novamente.' });
      }
      throw new Error(`OpenRouter error ${response.status}: ${JSON.stringify(errData)}`);
    }

    const data = await response.json();
    responseText = data.choices?.[0]?.message?.content || '';
  } catch (aiErr) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw aiErr;
  }

  fs.unlinkSync(req.file.path);

  let extracted = [];
  try {
    const text = responseText.trim();
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0];
    extracted = JSON.parse(jsonStr);
  } catch {
    return res.status(422).json({ error: 'Não foi possível extrair preços da imagem. Tente uma foto mais clara.' });
  }

  const matches = [];
  for (const item of extracted) {
    let bestMatch = null;
    let bestScore = 0;
    for (const product of products) {
      const score = similarity(item.produto, product.name);
      if (score > bestScore && score >= 0.35) {
        bestScore = score;
        bestMatch = product;
      }
    }
    if (bestMatch) {
      matches.push({
        product_id: bestMatch.product_id,
        product_name: bestMatch.name,
        extracted_name: item.produto,
        unit_price: Number(item.preco),
        confidence: Math.round(bestScore * 100),
      });
    }
  }

  for (const m of matches) {
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3`,
      [supplierId, m.product_id, m.unit_price]
    );
  }

  res.json({ matches, total_extracted: extracted.length, total_matched: matches.length });
}

module.exports = { extractPrices };
