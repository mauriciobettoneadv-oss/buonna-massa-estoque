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

// Extracts the brand portion from a product name.
// e.g. "Muçarela Frizzo Planato" → "Frizzo Planato", "Atum Marsul" → "Marsul"
function extractExpectedBrand(productName) {
  const words = productName.trim().split(/\s+/);
  return words.length > 1 ? words.slice(1).join(' ') : null;
}

async function getProducts(quotationId) {
  const result = await pool.query(
    `SELECT DISTINCT p.id AS product_id, p.name, p.purchase_unit
     FROM quotation_counts qc
     JOIN stock_count_items sci ON sci.stock_count_id = qc.stock_count_id
     JOIN products p ON p.id = sci.product_id
     WHERE qc.quotation_id = $1 AND sci.qty_to_buy > 0`,
    [quotationId]
  );
  return result.rows;
}

function buildPrompt(products) {
  const productList = products.map((p) => `- ${p.name} (${p.purchase_unit})`).join('\n');
  return `Esta é uma lista de preços de um fornecedor. Extraia todos os produtos e seus preços unitários visíveis.

Produtos que estou procurando (nome completo incluindo marca):
${productList}

Responda SOMENTE com um JSON válido no formato:
[{"produto": "nome exato como aparece no documento", "marca": "marca do produto como aparece no documento, ou null se não identificável", "preco": 12.50}, ...]

Regras:
- Use o preço unitário (por unidade/kg/caixa). Se houver preço por embalagem maior, divida.
- Números decimais com ponto (não vírgula).
- Se não encontrar preço para um produto, não inclua na lista.
- Retorne apenas o JSON, sem texto antes ou depois.`;
}

async function callAI(messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const err = new Error('rate_limit');
      err.statusCode = 429;
      throw err;
    }
    throw new Error(`OpenRouter error ${response.status}: ${JSON.stringify(errData)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseAIResponse(text) {
  const jsonStr = text.trim().match(/\[[\s\S]*\]/)?.[0];
  if (!jsonStr) throw new Error('no_json');
  return JSON.parse(jsonStr);
}

function matchAndCheckBrands(extracted, products) {
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
      const expectedBrand = extractExpectedBrand(bestMatch.name);
      let brandWarning = null;
      if (item.marca && expectedBrand) {
        const brandScore = similarity(item.marca, expectedBrand);
        if (brandScore < 0.4) {
          brandWarning = `Fornecedor enviou "${item.marca}", mas compramos "${expectedBrand}"`;
        }
      }
      matches.push({
        product_id: bestMatch.product_id,
        product_name: bestMatch.name,
        extracted_name: item.produto,
        extracted_brand: item.marca || null,
        unit_price: Number(item.preco),
        confidence: Math.round(bestScore * 100),
        brand_warning: brandWarning,
      });
    }
  }
  return matches;
}

async function savePricesToDB(supplierId, matches) {
  for (const m of matches) {
    await pool.query(
      `INSERT INTO quotation_prices (supplier_id, product_id, unit_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET unit_price = $3`,
      [supplierId, m.product_id, m.unit_price]
    );
  }
}

async function extractPrices(req, res) {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada no servidor.' });

  const { id: quotationId, supplierId } = req.params;
  const products = await getProducts(quotationId);
  const prompt = buildPrompt(products);

  const fileContents = req.files.map((file) => ({
    base64: fs.readFileSync(file.path).toString('base64'),
    mimetype: file.mimetype,
    path: file.path,
  }));

  let allExtracted = [];
  try {
    const aiResults = await Promise.all(
      fileContents.map(({ base64, mimetype }) =>
        callAI([{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}` } },
          ],
        }])
      )
    );

    for (const responseText of aiResults) {
      try {
        allExtracted = allExtracted.concat(parseAIResponse(responseText));
      } catch {
        // skip unparseable individual file response
      }
    }
  } catch (aiErr) {
    for (const { path } of fileContents) {
      if (fs.existsSync(path)) fs.unlinkSync(path);
    }
    if (aiErr.statusCode === 429) {
      return res.status(429).json({ error: 'Limite de requisições da IA atingido. Aguarde 1 minuto e tente novamente.' });
    }
    throw aiErr;
  }

  for (const { path } of fileContents) {
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }

  if (allExtracted.length === 0) {
    return res.status(422).json({ error: 'Não foi possível extrair preços. Tente uma imagem mais clara ou outro arquivo.' });
  }

  // Deduplicate by product name (keep first occurrence)
  const seen = new Set();
  const deduped = allExtracted.filter((item) => {
    const key = item.produto?.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const matches = matchAndCheckBrands(deduped, products);
  await savePricesToDB(supplierId, matches);

  res.json({ matches, total_extracted: deduped.length, total_matched: matches.length });
}

async function extractPricesFromText(req, res) {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Nenhum texto enviado.' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada no servidor.' });

  const { id: quotationId, supplierId } = req.params;
  const products = await getProducts(quotationId);
  const prompt = buildPrompt(products);

  let responseText;
  try {
    responseText = await callAI([{
      role: 'user',
      content: `${prompt}\n\nTexto da cotação:\n${text}`,
    }]);
  } catch (aiErr) {
    if (aiErr.statusCode === 429) {
      return res.status(429).json({ error: 'Limite de requisições da IA atingido. Aguarde 1 minuto e tente novamente.' });
    }
    throw aiErr;
  }

  let extracted;
  try {
    extracted = parseAIResponse(responseText);
  } catch {
    return res.status(422).json({ error: 'Não foi possível extrair preços do texto enviado.' });
  }

  const matches = matchAndCheckBrands(extracted, products);
  await savePricesToDB(supplierId, matches);

  res.json({ matches, total_extracted: extracted.length, total_matched: matches.length });
}

module.exports = { extractPrices, extractPricesFromText };
