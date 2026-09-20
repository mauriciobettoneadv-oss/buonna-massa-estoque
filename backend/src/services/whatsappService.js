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
  if (!settings?.evolution_instance || !settings?.evolution_key) {
    throw new Error('Z-API não configurada. Acesse Configurações de Notificações.');
  }

  const cleanNumber = number.replace(/\D/g, '');
  const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

  // Z-API: https://api.z-api.io/instances/{instanceId}/token/{token}/send-text
  const url = `https://api.z-api.io/instances/${settings.evolution_instance}/token/${settings.evolution_key}/send-text`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'client-token': settings.evolution_url || '' },
    body: JSON.stringify({ phone: fullNumber, message: text }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Z-API ${resp.status}: ${errText}`);
  }

  return resp.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToRecipients(recipients, messageType, message) {
  const settings = await getSettings();

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    if (!recipient.whatsapp) continue;
    if (i > 0) await sleep(2000); // 2s entre envios para evitar 429

    let status = 'enviado';
    let errorDetail = null;

    try {
      await sendMessage(recipient.whatsapp, message, settings);
    } catch (err) {
      status = 'falhou';
      errorDetail = err.message;

      // Reenvio automático após 5 minutos (com delay proporcional ao índice)
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
      }, 5 * 60 * 1000 + i * 2000);
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
