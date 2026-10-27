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
const conferenciaPedidoRoutes = require('./routes/conferenciaPedido');
const conferenciaEntregaRoutes = require('./routes/conferenciaEntrega');
const { exportData } = require('./controllers/exportController');
const { authenticate, requireRole } = require('./middleware/auth');
const asyncHandler = require('./middleware/asyncHandler');

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
app.use(express.json({ limit: '20mb' }));

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
app.use('/api/conferencia-pedido', conferenciaPedidoRoutes);
app.use('/api/conferencia-entrega', conferenciaEntregaRoutes);
app.get('/api/export', authenticate, requireRole('dono'), asyncHandler(exportData));

// ENDPOINT TEMPORÁRIO — remover após uso
app.get('/api/fix-produtos', async (req, res) => {
  if (req.query.secret !== 'bm-fix-oct2026') return res.status(403).json({ error: 'Proibido.' });
  const pool = require('./db/pool');
  const fixes = [];
  try {
    const run = async (name, sql, params) => {
      const r = await pool.query(sql, params);
      fixes.push({ produto: name, linhas: r.rowCount });
    };
    await run('Catupiry',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Kilo', box_qty=12, box_unit_weight=0.85 WHERE LOWER(name) ILIKE '%catupiry%'`);
    await run('Coca Cola 2 Litros',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Garrafa', box_qty=6, box_unit_weight=NULL WHERE LOWER(name) ILIKE '%coca%cola%2%litro%' AND LOWER(name) NOT ILIKE '%zero%'`);
    await run('Coca Cola 2 Litros Zero',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Garrafa', box_qty=6, box_unit_weight=NULL WHERE LOWER(name) ILIKE '%coca%' AND LOWER(name) ILIKE '%zero%' AND LOWER(name) ILIKE '%2%litro%'`);
    await run('Coca Cola Zero 350ml',
      `UPDATE products SET purchase_unit='Fardo', price_unit='Lata', box_qty=12, box_unit_weight=NULL WHERE LOWER(name) ILIKE '%coca%' AND LOWER(name) ILIKE '%zero%' AND LOWER(name) ILIKE '%350%'`);
    await run('Apresuntado Aurora',
      `UPDATE products SET purchase_unit='Peça', price_unit='Kilo', box_qty=NULL, box_unit_weight=3.5 WHERE LOWER(name) ILIKE '%apresuntado%aurora%'`);
    await run('Nutella 3KG',
      `UPDATE products SET purchase_unit='Balde', price_unit='Balde', box_qty=NULL, box_unit_weight=NULL WHERE LOWER(name) ILIKE '%nutella%3%'`);
    await run('Brocolis Picado',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Kilo', box_qty=10, box_unit_weight=0.5 WHERE LOWER(unaccent(name)) ILIKE '%brocolis%picado%'`);
    await run('Calabresa Reta',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Kilo', box_qty=1, box_unit_weight=10 WHERE LOWER(name) ILIKE '%calabresa%reta%'`);
    await run('Farinha Anaconda',
      `UPDATE products SET purchase_unit='Fardo', price_unit='Fardo', box_qty=NULL, box_unit_weight=NULL WHERE LOWER(name) ILIKE '%anaconda%' AND LOWER(name) ILIKE '%farinha%'`);
    await run('Guarana Antarctica 1L',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Garrafa', box_qty=12, box_unit_weight=NULL WHERE LOWER(unaccent(name)) ILIKE '%guarana%' AND (LOWER(name) ILIKE '%1 litro%' OR LOWER(name) ILIKE '%1litro%' OR LOWER(name) ILIKE '%1l%')`);
    await run('Filezinho de Sassami',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Kilo', box_qty=5, box_unit_weight=2.0 WHERE LOWER(name) ILIKE '%filezinho%sassami%'`);
    await run('Palmito Atracao',
      `UPDATE products SET purchase_unit='Caixa', price_unit='Lata', box_qty=24, box_unit_weight=NULL WHERE LOWER(unaccent(name)) ILIKE '%palmito%' AND LOWER(unaccent(name)) ILIKE '%atr%'`);

    // Retornar estado atual dos produtos corrigidos
    const check = await pool.query(
      `SELECT name, purchase_unit, price_unit, box_qty, box_unit_weight FROM products
       WHERE LOWER(name) ILIKE ANY(ARRAY['%catupiry%','%coca%','%apresuntado%','%nutella%3%','%sassami%','%palmito%','%anaconda%','%calabresa%reta%'])
       ORDER BY name`
    );
    res.json({ ok: true, fixes, produtos: check.rows });
  } catch (e) {
    res.status(500).json({ error: e.message, fixes });
  }
});

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
    await pool.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS box_qty         NUMERIC,
        ADD COLUMN IF NOT EXISTS box_unit_weight NUMERIC,
        ADD COLUMN IF NOT EXISTS price_unit      TEXT
    `);
    await pool.query(`
      ALTER TABLE suppliers
        ADD COLUMN IF NOT EXISTS delivery_cities TEXT[] DEFAULT '{}'
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supplier_unit_contacts (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        delivery_days TEXT[] DEFAULT '{}',
        UNIQUE(supplier_id, unit_id)
      )
    `);
    await pool.query(`
      ALTER TABLE quotation_prices
        ADD COLUMN IF NOT EXISTS notes     TEXT,
        ADD COLUMN IF NOT EXISTS alt_brand TEXT
    `);
    await pool.query(`
      ALTER TABLE notification_settings
        ADD COLUMN IF NOT EXISTS quotation_deadline_hour INTEGER DEFAULT 18,
        ADD COLUMN IF NOT EXISTS auto_send_quotation BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS quotation_msg_template TEXT DEFAULT 'Olá, {contact_name}! 🍕\nSou da Pizzaria Buonna Massa – {unit_name}.\nSegue o link para preenchimento da cotação desta semana:\n{link}\nAguardamos o preenchimento até {deadline}.\nObrigado!',
        ADD COLUMN IF NOT EXISTS quotation_reminder_template TEXT DEFAULT '⚠️ Lembrete – Pizzaria Buonna Massa\n{contact_name}, ainda não recebemos sua cotação.\nAcesse o link para preencher: {link}\nPrazo: hoje às {deadline_hour}h.'
    `);
    await pool.query(`
      ALTER TABLE quotations
        ADD COLUMN IF NOT EXISTS all_filled_notified BOOLEAN DEFAULT FALSE
    `);
    await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberta'`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conferencia_pedido (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER REFERENCES quotations(id),
        criado_por INTEGER REFERENCES users(id),
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'aberta',
        itens JSONB DEFAULT '[]'
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conferencia_entrega (
        id SERIAL PRIMARY KEY,
        conferencia_pedido_id INTEGER REFERENCES conferencia_pedido(id),
        conferente_id INTEGER REFERENCES users(id),
        finalizado_em TIMESTAMPTZ,
        status TEXT DEFAULT 'aberta',
        itens JSONB DEFAULT '[]'
      )
    `);
    await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS canais_compra JSONB DEFAULT '[]'`);
    await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS mesmo_vendedor BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_sao_pedro NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_piracicaba NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_per_package NUMERIC`);
    await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS canal_preferencial TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_count_edits (
        id SERIAL PRIMARY KEY,
        stock_count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        field TEXT NOT NULL,
        old_value NUMERIC,
        new_value NUMERIC,
        edited_by INTEGER REFERENCES users(id),
        edited_at TIMESTAMPTZ DEFAULT NOW()
      )
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
