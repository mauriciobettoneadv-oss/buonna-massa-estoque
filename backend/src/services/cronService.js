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

  // Lembrete de cotação às 16h
  cron.schedule('0 16 * * *', async () => {
    try { await checkAndSendReminders(); } catch (err) {
      console.error('[cron] erro ao enviar lembretes de cotação:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // Verificar se todos preencheram — a cada hora
  cron.schedule('0 * * * *', async () => {
    try { await checkAllFilled(); } catch (err) {
      console.error('[cron] erro ao verificar cotações preenchidas:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // Alerta 22h30 — entregas esperadas hoje não conferidas
  cron.schedule('30 22 * * *', async () => {
    try { await checkPendingDeliveries(); } catch (err) {
      console.error('[cron] erro no alerta de entregas pendentes:', err.message);
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

async function checkAndSendReminders() {
  const { getSettings, sendMessage } = require('./whatsappService');
  const settings = await getSettings();
  if (!settings?.evolution_instance || !settings?.evolution_key) return;

  const deadlineHour = settings.quotation_deadline_hour || 18;
  const template = settings.quotation_reminder_template ||
    '⚠️ Lembrete – Pizzaria Buonna Massa\n{contact_name}, ainda não recebemos sua cotação.\nAcesse o link para preencher: {link}\nPrazo: hoje às {deadline_hour}h.';

  const systemUrl = process.env.SYSTEM_URL || 'https://buonna-massa-estoque.vercel.app';

  // Cotações abertas criadas nas últimas 48h
  const quotations = await pool.query(
    `SELECT id FROM quotations WHERE status != 'finalizada' AND created_at > NOW() - INTERVAL '48 hours'`
  );

  for (const q of quotations.rows) {
    // Fornecedores sem preços ainda
    const pending = await pool.query(
      `SELECT qs.id, qs.name, qs.access_token,
              suc.phone, suc.contact_name
       FROM quotation_suppliers qs
       LEFT JOIN quotation_prices qp ON qp.supplier_id = qs.id
       LEFT JOIN suppliers s ON s.id = qs.supplier_id
       LEFT JOIN supplier_unit_contacts suc ON suc.supplier_id = qs.supplier_id
       WHERE qs.quotation_id = $1
       GROUP BY qs.id, qs.name, qs.access_token, suc.phone, suc.contact_name
       HAVING COUNT(qp.id) = 0`,
      [q.id]
    );

    for (const sup of pending.rows) {
      if (!sup.phone || !sup.access_token) continue;
      const link = `${systemUrl}/cotacao/${sup.access_token}`;
      const contactName = sup.contact_name || sup.name;
      const message = template
        .replace('{contact_name}', contactName)
        .replace('{link}', link)
        .replace('{deadline_hour}', deadlineHour);

      try {
        await sendMessage(sup.phone, message, settings);
        console.log(`[cron] Lembrete enviado para ${sup.name} (${sup.phone})`);
      } catch (err) {
        console.error(`[cron] Erro ao enviar lembrete para ${sup.name}:`, err.message);
      }
    }
  }
}

async function checkAllFilled() {
  const { getSettings, sendMessage } = require('./whatsappService');
  const settings = await getSettings();
  if (!settings?.evolution_instance || !settings?.evolution_key) return;

  const systemUrl = process.env.SYSTEM_URL || 'https://buonna-massa-estoque.vercel.app';

  // Cotações abertas ainda não notificadas de preenchimento completo
  const quotations = await pool.query(
    `SELECT id FROM quotations
     WHERE status != 'finalizada' AND all_filled_notified = FALSE
     AND created_at > NOW() - INTERVAL '48 hours'`
  );

  for (const q of quotations.rows) {
    const total = await pool.query(
      `SELECT COUNT(*) AS cnt FROM quotation_suppliers WHERE quotation_id = $1`, [q.id]
    );
    const filled = await pool.query(
      `SELECT COUNT(DISTINCT qs.id) AS cnt
       FROM quotation_suppliers qs
       JOIN quotation_prices qp ON qp.supplier_id = qs.id
       WHERE qs.quotation_id = $1`, [q.id]
    );

    const totalCnt = Number(total.rows[0].cnt);
    const filledCnt = Number(filled.rows[0].cnt);
    if (totalCnt === 0 || filledCnt < totalCnt) continue;

    // Todos preencheram — notificar donos
    const owners = await pool.query(
      `SELECT name, whatsapp FROM users WHERE role IN ('dono', 'proprietario', 'gerente') AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
    );

    const message = `✅ Todos os fornecedores já preencheram a cotação #${q.id}!\nAcesse o sistema para finalizar: ${systemUrl}`;

    for (const owner of owners.rows) {
      try {
        await sendMessage(owner.whatsapp, message, settings);
      } catch (err) {
        console.error(`[cron] Erro ao notificar dono ${owner.name}:`, err.message);
      }
    }

    await pool.query(`UPDATE quotations SET all_filled_notified = TRUE WHERE id = $1`, [q.id]);
    console.log(`[cron] Cotação #${q.id} totalmente preenchida — donos notificados.`);
  }
}

async function checkPendingDeliveries() {
  const { sendToRecipients } = require('./whatsappService');

  // Mapa JS getDay() → prefixos em português (minúsculo)
  const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const todayPrefix = DAYS[new Date().getDay()]; // ex: 'quinta'

  // Fornecedores que entregam hoje em cotações fechadas nos últimos 14 dias
  // e que ainda não tiveram conferência de entrega concluída hoje
  const result = await pool.query(`
    SELECT DISTINCT qs.name AS supplier_name, q.id AS quotation_id
    FROM quotation_suppliers qs
    JOIN quotations q ON q.id = qs.quotation_id
    LEFT JOIN suppliers s ON s.id = qs.supplier_id
    WHERE q.status = 'fechada'
      AND q.created_at > NOW() - INTERVAL '14 days'
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(s.delivery_days, '{}')) d
        WHERE lower(d) LIKE $1 || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM conferencia_entrega ce
        LEFT JOIN conferencia_pedido cp ON cp.id = ce.conferencia_pedido_id
        WHERE (
          (cp.quotation_id IS NOT NULL AND cp.quotation_id = q.id)
          OR (ce.quotation_id = q.id)
        )
        AND ce.finalizado_em AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
        AND ce.status IN ('ok', 'divergente')
      )
    ORDER BY qs.name
  `, [todayPrefix]);

  if (result.rows.length === 0) {
    console.log('[cron] Alerta 22h30: todas as entregas já foram conferidas. 👍');
    return;
  }

  const lista = result.rows.map(r => `• ${r.supplier_name}`).join('\n');
  const msg = `⚠️ *Alerta 22h30 — Entregas não conferidas hoje:*\n${lista}\n\nVerifique com as lojas ou entre em contato com os fornecedores.`;

  const donos = await pool.query(
    `SELECT name, whatsapp FROM users
     WHERE role IN ('dono','proprietario','gerente')
       AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );

  if (donos.rows.length > 0) {
    await sendToRecipients(donos.rows, 'alerta_entrega_pendente', msg);
    console.log(`[cron] Alerta 22h30 enviado: ${result.rows.length} fornecedor(es) pendente(s).`);
  } else {
    console.log('[cron] Alerta 22h30: sem números de WhatsApp cadastrados para notificar.');
  }
}

module.exports = { startCronJobs, runHealthCheck, checkPendingDeliveries };
