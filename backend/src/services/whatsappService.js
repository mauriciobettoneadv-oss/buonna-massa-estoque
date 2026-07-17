const pool = require('../db/pool');

async function getSettings() {
  const result = await pool.query('SELECT * FROM notification_settings LIMIT 1');
  return result.rows[0] || null;
}

async function logNotification({ recipientName, recipientWhatsapp, messageType, message, status, errorDetail }) {
  try {
    await pool.query(
      `INSERT INTO notification_log (recipient_name, recipient_whatsapp, message_type, message, status, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recipientName, recipientWhatsapp, messageType, message, status, errorDetail || null]
    );
  } catch (err) {
    console.error('Erro ao registrar log de notificação:', err.message);
  }
}

async function sendMessage(number, text, settings) {
  if (!settings?.evolution_url || !settings?.evolution_key || !settings?.evolution_instance) {
    throw new Error('Evolution API não configurada. Acesse Configurações de Notificações.');
  }

  const cleanNumber = number.replace(/\D/g, '');
  const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

  const url = `${settings.evolution_url.replace(/\/$/, '')}/message/sendText/${settings.evolution_instance}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: settings.evolution_key },
    body: JSON.stringify({ number: fullNumber, text }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Evolution API ${resp.status}: ${errText}`);
  }

  return resp.json();
}

async function sendToRecipients(recipients, messageType, message) {
  const settings = await getSettings();

  for (const recipient of recipients) {
    if (!recipient.whatsapp) continue;

    let status = 'enviado';
    let errorDetail = null;

    try {
      await sendMessage(recipient.whatsapp, message, settings);
    } catch (err) {
      status = 'falhou';
      errorDetail = err.message;

      // Reenvio automático após 5 minutos
      setTimeout(async () => {
        try {
          const freshSettings = await getSettings();
          await sendMessage(recipient.whatsapp, message, freshSettings);
          await logNotification({
            recipientName: recipient.name,
            recipientWhatsapp: recipient.whatsapp,
            messageType: `${messageType}_reenvio`,
            message,
            status: 'enviado',
          });
        } catch (retryErr) {
          await logNotification({
            recipientName: recipient.name,
            recipientWhatsapp: recipient.whatsapp,
            messageType: `${messageType}_reenvio`,
            message,
            status: 'falhou',
            errorDetail: retryErr.message,
          });
        }
      }, 5 * 60 * 1000);
    }

    await logNotification({
      recipientName: recipient.name,
      recipientWhatsapp: recipient.whatsapp,
      messageType,
      message,
      status,
      errorDetail,
    });
  }
}

module.exports = { getSettings, sendMessage, sendToRecipients, logNotification };
