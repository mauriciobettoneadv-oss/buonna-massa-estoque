const cron = require('node-cron');
const pool = require('../db/pool');

function startCronJobs() {
  // Verifica expiração de contagens a cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      await expireOldCounts();
    } catch (err) {
      console.error('[cron] erro ao expirar contagens:', err.message);
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

module.exports = { startCronJobs };
