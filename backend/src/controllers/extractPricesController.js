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
  const productList = products.map((p) => `- ${p.name} | unidade que compramos: ${p.purchase_unit}`).join('\n');
  return `Você é um assistente especializado em extração de preços de cotações de fornecedores de pizzaria brasileira.

O documento pode ser: mensagem de WhatsApp, foto de lista impressa, tabela PDF de distribuidora, ou e-mail.

PRODUTOS QUE ESTOU PROCURANDO (nome completo com marca | unidade que compramos):
${productList}

RESPONDA APENAS com JSON válido, sem texto antes ou depois:
[{"produto": "nome como aparece no documento", "marca": "marca identificada ou null", "preco": 12.50, "unidade_fornecedor": "kg|caixa|bisnaga|lata|fardo|pacote|galão|vidro|unidade|barra|bloco"}]

═══════════════════════════════════════════════════
REGRAS OBRIGATÓRIAS — leia todas antes de responder
═══════════════════════════════════════════════════

── IGNORAR (não incluir no JSON) ──
• Produtos com "não trabalho", "nao trabalho", "não tenho", "em falta", "xxx", "xxxx", "indisponível" ou qualquer variação → IGNORAR
• Observações informais após o preço ("troca do vidro", "novo emb", "promoção") → ignorar o texto, manter só o preço
• Texto de conversa, saudações, confirmações → ignorar

── PREÇO CORRETO ──
• Preço promocional "DE X POR Y" ou "DE X / Y" → usar SEMPRE o menor valor (Y), que é o preço final
• Quando o documento tem coluna "Preço(Kg)" E coluna "Preço" (tabelas de distribuidora) → usar a coluna "Preço" (preço por embalagem), NUNCA "Preço(Kg)"
• Se o produto tem quantidade na coluna "Qtd" = 1 e coluna "Total", o preço por embalagem = valor da coluna "Total"
• Se há dois fornecedores ou marcas para o mesmo item separados por "/" → escolher o que mais se aproxima da nossa marca; se nenhum bater, incluir os dois como entradas separadas

── UNIDADES ──
• Identificar a unidade do preço cotado e preencher "unidade_fornecedor"
• "bloco", "blocos" → considerar que o preço é por kg (cotação de laticínios em bloco é sempre por kg)
• "bisnaga", "bisnagas" → unidade_fornecedor = "bisnaga"
• "barra" → unidade_fornecedor = "barra" (ex: chocolate Harald — preço por barra, não por kg)
• CX-N = caixa com N unidades → unidade_fornecedor = "caixa"
• BG-N = bisnaga → unidade_fornecedor = "bisnaga"
• PC-N = pacote → unidade_fornecedor = "pacote"
• LA-N = lata → unidade_fornecedor = "lata"
• FD-N = fardo → unidade_fornecedor = "fardo"
• GL-N = galão → unidade_fornecedor = "galão"
• VD-N = vidro → unidade_fornecedor = "vidro"
• Quando o produto diz "5KG" no nome e há um preço único → o preço é pelo bloco de 5kg inteiro, unidade_fornecedor = "bloco 5kg"
• NÃO converta preços entre unidades — informe como está no documento

── MARCAS ──
• Preencher "marca" com a marca exata como aparece no documento
• Se a marca é diferente da que compramos, incluir mesmo assim (o sistema vai alertar o comprador)
• Se não há marca identificável, colocar null

── RECONHECIMENTO DE PRODUTO ──
• Pode haver variação de nome, abreviação ou ordem diferente das palavras — tente identificar mesmo assim
• Números decimais com PONTO (12.50), nunca vírgula`;
}

async function callAI(messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages,
      max_tokens: 4000,
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

// Normaliza nomes de unidade para comparação
function normalizeUnit(u) {
  if (!u) return '';
  const s = u.toLowerCase().trim();
  if (/^kg|quilo/.test(s)) return 'kg';
  if (/^cx|caixa/.test(s)) return 'caixa';
  if (/^un|unid/.test(s)) return 'unidade';
  if (/^fd|fardo/.test(s)) return 'fardo';
  if (/^pct|pacote/.test(s)) return 'pacote';
  if (/^balde/.test(s)) return 'balde';
  if (/^gal/.test(s)) return 'galão';
  if (/^lt|litro/.test(s)) return 'litro';
  return s;
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

      // Verificar divergência de unidade
      let unitWarning = null;
      if (item.unidade_fornecedor && bestMatch.purchase_unit) {
        const unitForn = normalizeUnit(item.unidade_fornecedor);
        const unitExp = normalizeUnit(bestMatch.purchase_unit);
        if (unitForn && unitExp && unitForn !== unitExp) {
          unitWarning = `Fornecedor cotou por ${item.unidade_fornecedor}, mas compramos por ${bestMatch.purchase_unit} — verifique o preço`;
        }
      }

      matches.push({
        product_id: bestMatch.product_id,
        product_name: bestMatch.name,
        extracted_name: item.produto,
        extracted_brand: item.marca || null,
        extracted_unit: item.unidade_fornecedor || null,
        expected_unit: bestMatch.purchase_unit,
        unit_price: Number(item.preco),
        confidence: Math.round(bestScore * 100),
        brand_warning: brandWarning,
        unit_warning: unitWarning,
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
    console.error('[extractPrices] erro na IA:', aiErr.message);
    return res.status(500).json({ error: `Erro ao consultar IA: ${aiErr.message}` });
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
    console.error('[extractPricesFromText] erro na IA:', aiErr.message);
    return res.status(500).json({ error: `Erro ao consultar IA: ${aiErr.message}` });
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
