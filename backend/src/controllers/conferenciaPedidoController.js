const pool = require('../db/pool');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// ── Fuzzy name matching ────────────────────────────────────────────────────

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.85;
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = nb.split(' ').filter(w => w.length > 2);
  if (wa.length === 0 || wb.length === 0) return 0;
  const common = wa.filter(w => wb.some(ww => ww.includes(w) || w.includes(ww)));
  return common.length / Math.max(wa.length, wb.length);
}

function matchByName(extractedName, itens) {
  let best = null;
  let bestScore = 0;
  for (const item of itens) {
    const score = similarity(extractedName, item.name);
    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      best = item;
    }
  }
  return { match: best, score: bestScore };
}

// ── PDF → texto via pdftotext ──────────────────────────────────────────────

function extractTextFromPdf(base64, mimeType) {
  if (!mimeType.includes('pdf')) return null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  const pdfPath = path.join(tmpDir, 'pedido.pdf');
  const txtPath = path.join(tmpDir, 'pedido.txt');
  try {
    fs.writeFileSync(pdfPath, Buffer.from(base64, 'base64'));
    execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`, { timeout: 15000 });
    const text = fs.readFileSync(txtPath, 'utf8');
    return text;
  } catch {
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

// ── Chamada à IA ───────────────────────────────────────────────────────────

function buildPrompt(itens) {
  const lista = itens.map(i =>
    `- ${i.name} | unidade de compra: ${i.purchase_unit} | qtd pedida: ${i.qty_pedida}`
  ).join('\n');

  return `Você é um assistente que confere espelhos de pedido de uma pizzaria brasileira.

PRODUTOS QUE ESTOU CONFERINDO (nome no nosso sistema | unidade | qtd que pedimos):
${lista}

Analise o documento e extraia TODOS os itens que aparecem nele.
Para cada item do documento retorne:
- "nome_doc": nome EXATO como aparece no documento
- "qty": quantidade (número)
- "preco_unit": preço unitário por embalagem (número decimal, em reais)
  - Se o documento mostrar Valor Total e Qtd, calcule: preco_unit = Valor Total / Qtd
  - Use SEMPRE o preço por embalagem, não por kg
  - Use ponto para decimal (12.50), não vírgula

REGRAS:
- Inclua TODOS os itens do documento, mesmo os que não estão na nossa lista
- Não invente dados — só inclua o que está claramente no documento
- Ignore cabeçalhos, totais, subtotais, observações

Responda APENAS com JSON válido, sem texto antes ou depois:
[{"nome_doc": "PRODUTO X 1KG", "qty": 2, "preco_unit": 45.90}]`;
}

async function callAI(messages) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY não configurada.');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429) throw Object.assign(new Error('rate_limit'), { statusCode: 429 });
    throw new Error(`IA retornou ${response.status}: ${JSON.stringify(errData)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Rota principal: extração do espelho do pedido ─────────────────────────

async function extractFromImage(req, res) {
  const { image_base64, image_type, itens } = req.body;

  if (!image_base64 || !itens || !itens.length) {
    return res.status(400).json({ error: 'Arquivo e lista de itens são obrigatórios.' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY não configurada no servidor.' });
  }

  const prompt = buildPrompt(itens);
  let aiText;

  // Tenta extrair texto do PDF primeiro (muito mais confiável)
  const pdfText = extractTextFromPdf(image_base64, image_type);

  try {
    if (pdfText && pdfText.trim().length > 50) {
      // PDF com texto extraível → envia como texto
      aiText = await callAI([{
        role: 'user',
        content: `${prompt}\n\nTexto do espelho de pedido:\n${pdfText}`,
      }]);
    } else {
      // Imagem ou PDF escaneado → envia como imagem
      aiText = await callAI([{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${image_type};base64,${image_base64}` } },
        ],
      }]);
    }
  } catch (err) {
    if (err.statusCode === 429) {
      return res.status(429).json({ error: 'Limite de requisições da IA atingido. Aguarde 1 minuto.' });
    }
    return res.status(502).json({ error: `Erro ao consultar IA: ${err.message}` });
  }

  const jsonStr = aiText.trim().match(/\[[\s\S]*\]/)?.[0];
  if (!jsonStr) return res.status(422).json({ error: 'IA não retornou dados válidos. Tente novamente.' });

  let extracted;
  try { extracted = JSON.parse(jsonStr); } catch {
    return res.status(422).json({ error: 'Erro ao interpretar resposta da IA.' });
  }

  if (!extracted.length) {
    return res.status(422).json({ error: 'Nenhum item encontrado no documento.' });
  }

  // Faz matching por similaridade de nome
  const matchResults = [];
  const itensResult = itens.map(item => {
    // Procura o item extraído que melhor casa com este produto
    let bestExtracted = null;
    let bestScore = 0;
    for (const ext of extracted) {
      const score = similarity(ext.nome_doc, item.name);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestExtracted = ext;
      }
    }

    if (!bestExtracted) return item; // não encontrado no espelho

    matchResults.push({
      product_id: item.product_id,
      nome_sistema: item.name,
      nome_doc: bestExtracted.nome_doc,
      confidence: Math.round(bestScore * 100),
    });

    return {
      ...item,
      qty_recebida: bestExtracted.qty ?? item.qty_recebida,
      valor_cobrado: bestExtracted.preco_unit ?? item.valor_cobrado,
    };
  });

  // Itens do documento que não foram matched (possíveis extras)
  const nomesMatched = new Set(matchResults.map(m => normalize(m.nome_doc)));
  const naoIdentificados = extracted.filter(e => !nomesMatched.has(normalize(e.nome_doc)));

  res.json({
    itens: itensResult,
    matches: matchResults,
    nao_identificados: naoIdentificados,
    via_pdf_text: !!(pdfText && pdfText.trim().length > 50),
  });
}

// ── CRUD ───────────────────────────────────────────────────────────────────

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
