// Calcule le SHA-256 (hex) d'un PIN, identique au hash attendu par le serveur.
const pinEl = document.getElementById('pin');
const hashEl = document.getElementById('hash');
const msg = document.getElementById('msg');

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function update() {
  const v = pinEl.value;
  hashEl.value = v ? await sha256Hex(v) : '';
}
pinEl.addEventListener('input', update);

document.getElementById('copyBtn').addEventListener('click', async () => {
  if (!hashEl.value) { msg.textContent = 'Saisissez d\'abord un PIN.'; return; }
  try { await navigator.clipboard.writeText(hashEl.value); msg.textContent = 'Hash copié !'; }
  catch { hashEl.select(); msg.textContent = 'Copiez manuellement (Ctrl+C).'; }
});
