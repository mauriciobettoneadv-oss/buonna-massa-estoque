const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  // Always respond OK to avoid email enumeration
  if (!result.rows[0]) {
    return res.json({ ok: true });
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE
    )
  `);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await pool.query(
    'INSERT INTO password_reset_codes (email, code, expires_at) VALUES ($1, $2, $3)',
    [email.toLowerCase(), code, expiresAt]
  );

  try {
    const mailer = getMailer();
    await mailer.sendMail({
      from: `"Buonna Massa Estoque" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Código de redefinição de senha',
      text: `Seu código de redefinição é: ${code}\n\nEle expira em 15 minutos.`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px">
          <h2 style="color:#812f28">Redefinição de senha</h2>
          <p>Seu código de redefinição é:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#231f20;margin:16px 0">${code}</div>
          <p style="color:#888;font-size:13px">Expira em 15 minutos. Se não foi você, ignore este e-mail.</p>
        </div>
      `,
    });
  } catch (mailErr) {
    console.error('Erro ao enviar e-mail:', mailErr.message);
    return res.status(500).json({ error: 'Falha ao enviar e-mail. Verifique a configuração SMTP.' });
  }

  res.json({ ok: true });
}

async function resetPassword(req, res) {
  const { email, code, password } = req.body;
  if (!email || !code || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const result = await pool.query(
    `SELECT id FROM password_reset_codes
     WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email.toLowerCase(), code]
  );

  if (!result.rows[0]) {
    return res.status(400).json({ error: 'Código inválido ou expirado.' });
  }

  await pool.query('UPDATE password_reset_codes SET used = TRUE WHERE id = $1', [result.rows[0].id]);

  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email.toLowerCase()]);

  res.json({ ok: true });
}

module.exports = { login, forgotPassword, resetPassword };
