const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const { OWNER_ROLES } = require('../middleware/auth');

async function listUsers(req, res) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.unit_id, u.whatsapp, un.name AS unit_name
     FROM users u LEFT JOIN units un ON un.id = u.unit_id
     ORDER BY u.id`
  );
  res.json(result.rows);
}

async function createUser(req, res) {
  const { name, email, password, role, unit_id, whatsapp } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Nome, e-mail, senha e perfil são obrigatórios.' });
  }
  if (role === 'dono' && !OWNER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas o Dono pode criar outros Donos.' });
  }
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, unit_id, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, active, unit_id, whatsapp`,
    [name, email, hash, role, unit_id || null, whatsapp || null]
  );
  res.status(201).json(result.rows[0]);
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { name, email, password, role, unit_id, whatsapp } = req.body;
  const actor = req.user;

  // Gerente cannot change roles
  if (role !== undefined && !OWNER_ROLES.includes(actor.role)) {
    return res.status(403).json({ error: 'Apenas o Dono pode alterar o perfil de usuários.' });
  }
  // Only dono can assign dono role
  if (role === 'dono' && !OWNER_ROLES.includes(actor.role)) {
    return res.status(403).json({ error: 'Apenas o Dono pode atribuir perfil Dono.' });
  }

  const fields = [];
  const values = [];
  let idx = 1;
  if (name) { fields.push(`name = $${idx++}`); values.push(name); }
  if (email) { fields.push(`email = $${idx++}`); values.push(email); }
  if (password) { fields.push(`password_hash = $${idx++}`); values.push(await bcrypt.hash(password, 10)); }
  if (role) { fields.push(`role = $${idx++}`); values.push(role); }
  if (unit_id !== undefined) { fields.push(`unit_id = $${idx++}`); values.push(unit_id || null); }
  if (whatsapp !== undefined) { fields.push(`whatsapp = $${idx++}`); values.push(whatsapp || null); }
  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  values.push(id);
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, active, unit_id, whatsapp`,
    values
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(result.rows[0]);
}

async function toggleActive(req, res) {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE users SET active = NOT active WHERE id = $1 RETURNING id, name, active`,
    [id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(result.rows[0]);
}

async function deleteUser(req, res) {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
  }
  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ ok: true });
}

module.exports = { listUsers, createUser, updateUser, toggleActive, deleteUser };
