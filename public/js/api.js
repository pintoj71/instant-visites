// Wrapper minimal pour les appels à /api/*
export const api = {
  async req(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      credentials: 'same-origin'
    });
    if (res.status === 401) {
      if (location.pathname !== '/' && location.pathname !== '/index.html') {
        location.href = '/';
      }
      throw new Error('Non autorisé');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  get(path) { return this.req(path); },
  post(path, body) { return this.req(path, { method: 'POST', body: JSON.stringify(body) }); },
  patch(path, body) { return this.req(path, { method: 'PATCH', body: JSON.stringify(body) }); }
};

export function toast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Récupère le nom d'une option singleSelect (objet {name} ou string)
export function getOptionName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0]?.name || v[0] || '';
  return v.name || '';
}
