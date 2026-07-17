const cron = require('node-cron');
const pool = require('../db/pool');
const { getSettings, sendToRecipients } = require('./whatsappService');

function startCronJobs() {
  // Executa a cada minuto para verificar horários configurados
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndSend();
    } catch (err) {
      console.error('[cron] erro:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[cron] Jobs de notificação iniciados (fuso: America/Sao_Paulo)');
}

async function checkAndSend() {
  const settings = await getSettings();
  if (!settings?.evolution_url) return; // API não configurada, silencioso

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = now.getDay(); // 0=Dom
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const days = Array.isArray(settings.schedule_days)
    ? settings.schedule_days.map(Number)
    : [];

  if (!days.includes(dayOfWeek)) return;

  if (currentTime === settings.main_time) {
    await sendMainNotification(settings);
  } else if (currentTime === settings.reminder_time) {
    await sendReminderNotification(settings);
  }
}

async function hasTodaysSavedCount() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
  const result = await pool.query(
    `SELECT id FROM stock_counts WHERE status IN ('salva', 'finalizada') AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1 LIMIT 1`,
    [today]
  );
  return result.rows.length > 0;
}

async function sendMainNotification(settings) {
  if (await hasTodaysSavedCount()) return; // Contagem já salva hoje

  const result = await pool.query(
    `SELECT name, whatsapp FROM users WHERE role IN ('gerente', 'contador') AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );
  if (result.rows.length === 0) return;

  await sendToRecipients(result.rows, 'aviso_principal', settings.main_message);
  console.log(`[cron] Aviso principal enviado para ${result.rows.length} destinatário(s).`);
}

async function sendReminderNotification(settings) {
  if (await hasTodaysSavedCount()) return; // Contagem já salva, lembrete desnecessário

  const result = await pool.query(
    `SELECT name, whatsapp FROM users WHERE role IN ('gerente', 'contador') AND active = TRUE AND whatsapp IS NOT NULL AND whatsapp <> ''`
  );
  if (result.rows.length === 0) return;

  await sendToRecipients(result.rows, 'lembrete', settings.reminder_message);
  console.log(`[cron] Lembrete enviado para ${result.rows.length} destinatário(s).`);
}

module.exports = { startCronJobs };
