const cron = require('node-cron');
const pool = require('../db/pool');

const AI_MODEL = 'google/gemini-2.5-flash';

function startCronJobs() {
  // Expiração de contagens — todo hora
  cron.schedule('0 * * * *', async () => {
    try { await expireOldCounts(); } catch (err) {
      console.error('[cron] erro ao expirar contagens:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // Teste semanal de saúde — sábados às 22h
  cron.schedule('0 22 * * 6', async () => {
    try { await runHealthCheck(); } catch (err) {
      console.error('[cron] erro no health check:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[cron] Jobs iniciados (fuso: America/Sao_Paulo)');
}

// Deleta contagens abertas/salvas iniciadas no domingo com mais de 48h sem finalização
async function expireOldCounts() {
  const result = await pool.query(
    `DELETE FROM stock_counts
     WHERE status IN ('aberta', 'salva')
       AND EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo') = 0
       AND created_at < NOW() - INTERVAL '48 hours'
     RETURNING id, unit_id, created_at`
  );
  if (result.rows.length > 0) {
    console.log(`[cron] ${result.rows.length} contagem(s) expirada(s):`, result.rows.map(r => `id=${r.id} unit=${r.unit_id}`).join(', '));
  }
}

async function runHealthCheck() {
  const details = {};
  let dbOk = false;
  let aiOk = false;

  // Teste banco de dados
  try {
    const r = await pool.query('SELECT COUNT(*) FROM products');
    details.db_products = Number(r.rows[0].count);
    dbOk = true;
  } catch (err) {
    details.db_error = err.message;
  }

  // Teste IA (OpenRouter)
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: 'Responda apenas: OK' }],
        max_tokens: 5,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      details.ai_response = data.choices?.[0]?.message?.content?.trim();
      aiOk = true;
    } else {
      details.ai_error = `HTTP ${resp.status}`;
    }
  } catch (err) {
    details.ai_error = err.message;
  }

  await pool.query(
    `INSERT INTO health_checks (db_ok, ai_ok, ai_model, details) VALUES ($1, $2, $3, $4)`,
    [dbOk, aiOk, AI_MODEL, JSON.stringify(details)]
  );

  console.log(`[cron] Health check: db=${dbOk} ai=${aiOk}`, details);
}

module.exports = { startCronJobs, runHealthCheck };
