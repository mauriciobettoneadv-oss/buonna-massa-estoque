require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const unitRoutes = require('./routes/unitRoutes');
const stockCountRoutes = require('./routes/stockCountRoutes');
const quotationRoutes = require('./routes/quotations');
const userRoutes = require('./routes/users');
const supplierRoutes = require('./routes/suppliers');
const notificationRoutes = require('./routes/notifications');

const { startCronJobs, runHealthCheck } = require('./services/cronService');
const { getQuotationByToken, saveQuotationByToken } = require('./controllers/supplierTokenController');

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origem não permitida'));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rotas públicas para fornecedores (sem autenticação)
app.get('/api/cotacao/:token', async (req, res) => { try { await getQuotationByToken(req, res); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/cotacao/:token/precos', async (req, res) => { try { await saveQuotationByToken(req, res); } catch (e) { res.status(500).json({ error: e.message }); } });

// Histórico de health checks (últimos 10)
app.get('/api/health/history', async (req, res) => {
  const pool = require('./db/pool');
  const r = await pool.query('SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 10');
  res.json(r.rows);
});

// Rodar health check manualmente (dono)
app.post('/api/health/run', async (req, res) => {
  try {
    await runHealthCheck();
    const pool = require('./db/pool');
    const r = await pool.query('SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 1');
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/stock-counts', stockCountRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/notifications', notificationRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

async function startServer() {
  const pool = require('./db/pool');
  // Garante que as colunas de token de fornecedor existam no banco de produção
  try {
    await pool.query(`
      ALTER TABLE quotation_suppliers
        ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ
    `);
    console.log('[startup] Colunas de supplier token verificadas.');
  } catch (e) {
    console.error('[startup] Erro ao verificar colunas de supplier token:', e.message);
  }

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Buonna Massa API rodando em http://localhost:${PORT}`);
    startCronJobs();
  });
}

startServer();
