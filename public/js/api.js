// Wrapper minimal pour les appels à /api/*
export const api = {
  async req(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(`/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        credentials: 'same-origin',
        signal: controller.signal
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
      return await res.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Le serveur ne répond pas après 45 secondes. L’envoi n’est pas confirmé. Votre saisie est conservée sur cet appareil ; vérifiez la connexion puis réessayez.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
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

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
