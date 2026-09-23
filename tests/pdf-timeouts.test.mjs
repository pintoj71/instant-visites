import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const pdfSource = (await readFile(new URL('../public/js/pdf-generator.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace('export async function', 'async function');
function pdfHarness() {
  const timers = new Map(), scripts = [], images = [];
  let id = 0;
  const context = vm.createContext({
    window: {},
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); },
    document: {
      createElement() { return { remove() { this.removed = true; } }; },
      head: { appendChild(s) { scripts.push(s); } }
    },
    Image: class { constructor() { images.push(this); } }
  });
  vm.runInContext(pdfSource, context);
  return { context, scripts, images, expire() { const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); } };
}
test('Moteur PDF bloqué : délai explicite puis nouvel essai possible', async () => {
  const h = pdfHarness();
  const pending = vm.runInContext('loadJsPDF()', h.context);
  const rejection = assert.rejects(pending, /20 secondes/);
  h.expire(); await rejection;
  assert.equal(h.scripts[0].removed, true);
  const retry = vm.runInContext('loadJsPDF()', h.context);
  assert.equal(h.scripts.length, 2);
  h.context.window.jspdf = { jsPDF: { API: {} } };
  h.scripts[1].onload();
  await Promise.resolve(); await Promise.resolve();
  h.context.window.jspdf.jsPDF.API.autoTable = () => {};
  h.scripts[2].onload();
  assert.equal(await retry, h.context.window.jspdf.jsPDF);
});
test('Image bloquée ou invalide : le rapport échoue au lieu de rester en attente', async () => {
  const h = pdfHarness();
  const pending = vm.runInContext("imgSize('data:image/png;base64,test')", h.context);
  const rejection = assert.rejects(pending, /ne se charge pas/);
  h.expire(); await rejection;
  const invalid = vm.runInContext("imgSize('invalid')", h.context);
  const rejected = assert.rejects(invalid, /illisible/);
  h.images[1].onerror(); await rejected;
});
test('API bloquée pendant la réponse : annulation, message et timer nettoyé', async () => {
  const source = (await readFile(new URL('../public/js/api.js', import.meta.url), 'utf8')).replaceAll('export ', '');
  let expire, cleared = false, signal;
  const context = vm.createContext({
    AbortController,
    setTimeout(fn) { expire = fn; return 1; },
    clearTimeout() { cleared = true; },
    location: { pathname: '/visite' },
    fetch: async (url, options) => {
      signal = options.signal;
      return { ok: true, status: 200, json: () => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }) };
    }
  });
  vm.runInContext(source, context);
  const pending = vm.runInContext("api.post('/upload-pdf', {})", context);
  await new Promise(setImmediate);
  const rejection = assert.rejects(pending, /45 secondes/);
  expire(); await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(cleared, true);
});
