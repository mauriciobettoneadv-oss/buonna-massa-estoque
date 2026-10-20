const API_URL = import.meta.env.VITE_API_URL;

// Callback registrado pelo AuthContext para fazer logout automático
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    // Token expirado ou inválido → desloga e redireciona para login
    if (onUnauthorized) onUnauthorized();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição.');
  }
  return data;
}

export default request;
