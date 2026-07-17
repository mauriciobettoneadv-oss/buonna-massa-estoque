const pool = require('../db/pool');
const { getSettings, sendMessage } = require('../services/whatsappService');

async function getNotificationSettings(req, res) {
  const settings = await getSettings();
  res.json(settings || {
    schedule_days: [0],
    main_time: '18:00',
    reminder_time: '22:00',
    main_message: 'Realizar contagem de estoque.',
    reminder_message: 'A contagem ainda não foi feita.',
    evolution_url: '',
    evolution_key: '',
    evolution_instance: '',
  });
}

async function updateNotificationSettings(req, res) {
  const {
    schedule_days, main_time, reminder_time, main_message, reminder_message,
    evolution_url, evolution_key, evolution_instance,
  } = req.body;

  const existing = await pool.query('SELECT id FROM notification_settings LIMIT 1');

  if (existing.rows.length === 0) {
    const result = await pool.query(
      `INSERT INTO notification_settings
         (schedule_days, main_time, reminder_time, main_message, reminder_message, evolution_url, evolution_key, evolution_instance, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [schedule_days, main_time, reminder_time, main_message, reminder_message,
       evolution_url || null, evolution_key || null, evolution_instance || null]
    );
    return res.json(result.rows[0]);
  }

  const current = existing.rows[0];
  const finalKey = evolution_key || null;

  const result = await pool.query(
    `UPDATE notification_settings SET
       schedule_days=$1, main_time=$2, reminder_time=$3, main_message=$4, reminder_message=$5,
       evolution_url=$6, evolution_key=COALESCE($7, evolution_key), evolution_instance=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [schedule_days, main_time, reminder_time, main_message, reminder_message,
     evolution_url || null, finalKey, evolution_instance || null,
     current.id]
  );
  res.json(result.rows[0]);
}

async function testConnection(req, res) {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Informe o número para teste.' });

  const settings = await getSettings();
  if (!settings?.evolution_url) {
    return res.status(400).json({ error: 'Evolution API não configurada.' });
  }

  try {
    await sendMessage(number, '✅ Teste de conexão Buonna Massa – funcionando!', settings);
    res.json({ ok: true, message: 'Mensagem de teste enviada com sucesso!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getNotificationLog(req, res) {
  const result = await pool.query(
    `SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 200`
  );
  res.json(result.rows);
}

module.exports = { getNotificationSettings, updateNotificationSettings, testConnection, getNotificationLog };
