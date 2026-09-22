import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as points from '../public/js/points-visite.js';
import { escapeHtml, getOptionName, localDate, fmtDate } from '../public/js/api.js';

const html = await readFile(new URL('../public/visite.html', import.meta.url), 'utf8');
const original = await readFile(new URL('../public/js/visite.js', import.meta.url), 'utf8');
const source = original.replace(/^import[\s\S]*?from '[^']+';\n/gm, '').replace('(async function init() {', 'const initDone = (async function init() {');
const recordId = 'rec12345678901234';
const validData = { client: 'Client test', adresse: 'Adresse test', typeProjet: 'Poêle ou insert bois', dateVisite: '2026-09-22', faisabilite: 'Faisable', conduitExistant: 'Non', emplacementBois: 'Salon', distancesSecurite: 'À relever selon appareil', technicien: 'Test' };
function storedRecord(data = validData) {
  return { id: recordId, fields: { Client: data.client, 'Réponses (JSON)': JSON.stringify({ answers: data }), 'Statut': 'Brouillon', 'Signature client': 'client', 'Signature technicien': 'tech', 'Photos': [], 'Croquis': [] } };
}
async function setup({ record = storedRecord(), draft, user = 'Test', newVisit = false, failUpload = false, failPdf = false, missingAttachments = false, failGet = false } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/visite.html${newVisit ? '' : '?id=' + recordId}`, runScripts: 'outside-only' });
  const w = dom.window, calls = [], messages = [], pads = [];
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.confirm = () => true;
  Object.assign(w, points, { escapeHtml, getOptionName, localDate });
  w.toast = msg => messages.push(msg);
  w.openCroquisEditor = () => {};
  w.initSignaturePad = (canvas, placeholder, change) => {
    let value = '';
    const pad = { isEmpty: () => !value, toDataURL: () => value, clear: () => { value = ''; }, fromDataURL: async url => { value = url; }, sign: () => { value = 'data:image/png;base64,c2ln'; change(); } };
    pads.push(pad); return pad;
  };
  w.generatePdf = async payload => {
    calls.push(['pdf', payload]);
    if (failPdf) throw new Error('PDF simulé indisponible');
    return { output: () => 'data:application/pdf;base64,cGRm', save: () => calls.push(['download']) };
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  w.api = {
    get: async path => {
      calls.push(['get', path]);
      if (path === '/me') return { name: user };
      if (path.startsWith('/visite-attachments')) return { photos: missingAttachments ? [] : record.fields.Photos.map(a => ({ ...a, dataUrl: 'data:image/jpeg;base64,eA==' })), croquis: [] };
      if (failGet) throw new Error('Déconnexion simulée');
      return { visite: clone(record) };
    },
    patch: async (path, body) => { calls.push(['patch', clone(body)]); Object.assign(record.fields, clone(body.fields)); return { visite: clone(record) }; },
    post: async (path, body) => {
      calls.push(['post', path, clone(body)]);
      if (path === '/visites') { Object.assign(record.fields, clone(body.fields)); return { visite: clone(record) }; }
      if (path === '/upload-pdf' && failUpload === 'pdf') throw new Error('Envoi PDF échoué');
      if (path === '/upload-photo') {
        if (failUpload === 'photo') throw new Error('Envoi photo échoué');
        record.fields.Photos.push({ id: 'att123', filename: body.filename });
      }
      return {};
    }
  };
  if (draft) w.localStorage.setItem(`visite:${encodeURIComponent(user)}:${newVisit ? 'new' : recordId}`, JSON.stringify({ owner: user, dirty: true, ...draft }));
  w.eval(source + '\nwindow.testing = { state, initDone, onDraft, onFinalize, onPreview, buildFields, scheduleSave, persist, readLocalDraft, validationProblems, restoreLocal, get dirty() { return dirty; } };');
  await w.testing.initDone;
  await Promise.resolve();
  return { dom, w, app: w.testing, calls, messages, record, pads, close: () => w.close() };
}

test('Réouverture : données locales, signature effacée et pièces jointes non envoyées sont reprises', async () => {
  const x = await setup({ draft: { data: { ...validData, client: 'Modification locale', datePosePrevue: '' }, sigTech: '', sigClient: 'local', newPhotos: [{ dataUrl: 'data:image/jpeg;base64,eA==', label: 'Conduit' }] } });
  try {
    assert.equal(x.w.document.querySelector('[data-key="client"]').value, 'Modification locale');
    assert.equal(x.pads[0].isEmpty(), true);
    assert.equal(x.app.state.newPhotos.length, 1);
    assert.match(x.w.document.getElementById('saveStatus').textContent, /Sur cet appareil/);
    assert.equal(x.w.document.querySelector('[data-key="client"]').closest('[data-visit-panel]').dataset.visitPanel, 'projet');
  } finally { x.close(); }
});
test('Champs vidés : PATCH explicite à null, lien client supprimé', async () => {
  const x = await setup();
  try {
    x.pads[0].clear(); x.pads[1].clear();
    const fields = x.app.buildFields('Brouillon');
    for (const key of ['Téléphone', 'Email', 'Date pose prévue', 'Équipe pose', 'Signature technicien', 'Signature client']) assert.equal(fields[key], null, key);
    assert.equal(fields['Client/Prospect'].length, 0);
    await x.app.onDraft();
    assert.equal(x.record.fields['Signature client'], null);
    assert.match(x.w.document.getElementById('saveStatus').textContent, /Enregistré en ligne/);
  } finally { x.close(); }
});
test('Signature seule et départ immédiat : sauvegarde locale complète', async () => {
  const x = await setup();
  try {
    x.pads[0].sign();
    x.w.dispatchEvent(new x.w.Event('pagehide'));
    const d = x.app.readLocalDraft();
    assert.match(d.sigTech, /^data:image/);
    assert.equal(d.dirty, true);
  } finally { x.close(); }
});
test('Stockage plein : aucune fausse confirmation de sauvegarde', async () => {
  const x = await setup();
  try {
    x.pads[0].sign();
    x.w.Storage.prototype.setItem = () => { throw new Error('Quota'); };
    assert.equal(x.app.persist(), false);
    assert.match(x.w.document.getElementById('saveStatus').textContent, /Non sauvegardé/);
  } finally { x.close(); }
});
for (const failure of ['photo', 'pdf', 'generation']) test(`Échec ${failure} : aucune clôture et brouillon conservé`, async () => {
  const x = await setup({ failUpload: failure, failPdf: failure === 'generation' });
  try {
    if (failure === 'photo') x.app.state.newPhotos.push({ dataUrl: 'data:image/jpeg;base64,eA==', label: 'Photo à envoyer' });
    await x.app.onFinalize();
    assert.equal(x.record.fields.Statut, 'Brouillon');
    assert.equal(x.calls.some(c => c[0] === 'patch' && c[1].fields.Statut === 'Terminée'), false);
    assert.ok(x.app.readLocalDraft());
    assert.equal(x.w.document.querySelector('main').inert, false);
    if (failure === 'photo') assert.equal(x.app.state.newPhotos.length, 1);
  } finally { x.close(); }
});
test('Succès : photos puis PDF puis statut Terminée ; actions concurrentes ignorées', async () => {
  const x = await setup();
  try {
    x.app.state.newPhotos.push({ dataUrl: 'data:image/jpeg;base64,eA==', label: 'Arrivée d’air' });
    await Promise.all([x.app.onFinalize(), x.app.onDraft()]);
    assert.equal(x.record.fields.Statut, 'Terminée');
    const upload = x.calls.findIndex(c => c[0] === 'post' && c[1] === '/upload-pdf');
    const completed = x.calls.findIndex(c => c[0] === 'patch' && c[1].fields.Statut === 'Terminée');
    assert.ok(upload >= 0 && completed > upload);
    assert.equal(x.calls.filter(c => c[0] === 'post' && c[1] === '/upload-photo').length, 1);
    assert.equal(x.app.readLocalDraft(), null);
  } finally { x.close(); }
});
test('Deux sauvegardes et réouverture : légendes maintenues, pas de photo dupliquée', async () => {
  const x = await setup();
  let saved;
  try {
    x.app.state.newPhotos.push({ dataUrl: 'data:image/jpeg;base64,eA==', label: 'Tableau électrique' });
    await x.app.onDraft(); await x.app.onDraft();
    assert.equal(x.record.fields.Photos.length, 1);
    const filename = x.record.fields.Photos[0].filename;
    assert.equal(JSON.parse(x.record.fields['Réponses (JSON)']).attachmentLabels[filename], 'Tableau électrique');
    saved = x.record;
  } finally { x.close(); }
  const y = await setup({ record: saved });
  try { assert.equal(y.app.state.existingPhotos[0].label, 'Tableau électrique'); } finally { y.close(); }
});
test('Pièce jointe distante manquante : aperçu PDF bloqué explicitement', async () => {
  const rec = storedRecord(); rec.fields.Photos.push({ id: 'att1', filename: 'photo.jpg' });
  const x = await setup({ record: rec, missingAttachments: true });
  try { await x.app.onPreview(); assert.equal(x.calls.some(c => c[0] === 'pdf'), false); assert.ok(x.messages.some(m => m.includes('incomplet'))); } finally { x.close(); }
});
test('Nouvelle visite : première création migre le brouillon et évite une deuxième création', async () => {
  const x = await setup({ newVisit: true, draft: { data: validData, sigTech: 's', sigClient: 's' } });
  try {
    await x.app.onDraft(); await x.app.onDraft();
    assert.equal(x.calls.filter(c => c[0] === 'post' && c[1] === '/visites').length, 1);
    assert.match(x.w.location.search, /id=rec/);
    assert.equal(x.w.localStorage.getItem('visite:Test:new'), null);
  } finally { x.close(); }
});
test('9 projets : contrôles spécifiques et Non applicable explicite', async () => {
  for (const type of points.TYPES_PROJET) {
    const x = await setup({ record: storedRecord({ ...validData, typeProjet: type }) });
    try {
      for (const block of points.blocksForType(type)) {
        for (const key of points.TECH_REQUIRED[block.id] || []) {
          const el = x.w.document.querySelector(`[data-key="${key}"]`);
          assert.ok(el, `${type} / ${key}`);
          if (el.type === 'radio') x.w.document.querySelectorAll(`[data-key="${key}"]`).forEach(e => e.checked = false);
          else el.value = '';
          delete x.app.state.answers[key];
        }
      }
      assert.ok(x.app.validationProblems().length > 0, type);
      x.w.document.querySelectorAll('.section-na input').forEach(e => e.checked = true);
      assert.equal(x.app.validationProblems().length, 0, type);
    } finally { x.close(); }
  }
});
test('Serveur indisponible : brouillon récupéré mais aucune écriture aveugle', async () => {
  const x = await setup({ failGet: true, draft: { data: validData } });
  try { await x.app.onDraft(); assert.equal(x.calls.some(c => c[0] === 'patch'), false); assert.ok(x.app.readLocalDraft()); } finally { x.close(); }
});
test('Dates : format civil conservé et date par défaut locale', () => {
  assert.equal(fmtDate('2026-09-22'), '22/09/2026');
  assert.equal(localDate(new Date(2026, 8, 22, 0, 5)), '2026-09-22');
});

test('Signature réelle : fin de tracé déclenche le rappel de sauvegarde', async () => {
  const signatureSource = await readFile(new URL('../public/js/signature.js', import.meta.url), 'utf8');
  const dom = new JSDOM('<canvas></canvas><span></span>', { runScripts: 'outside-only' });
  const w = dom.window;
  try {
    const canvas = w.document.querySelector('canvas');
    canvas.getBoundingClientRect = () => ({ width: 300, height: 120, left: 0, top: 0 });
    canvas.getContext = () => ({ setTransform() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} });
    canvas.toDataURL = () => 'data:image/png;base64,eA==';
    w.eval(signatureSource.replace('export function', 'function') + '\nwindow.initPad = initSignaturePad;');
    let changed = 0;
    w.initPad(canvas, w.document.querySelector('span'), () => changed++);
    canvas.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 40, clientY: 20 }));
    canvas.dispatchEvent(new w.MouseEvent('mouseup'));
    canvas.dispatchEvent(new w.MouseEvent('mouseleave'));
    assert.equal(changed, 1);
  } finally { w.close(); }
});
test('Liste serveur : transmet le curseur Airtable et renvoie celui de la page suivante', async () => {
  const { default: vm } = await import('node:vm');
  const text = await readFile(new URL('../netlify/functions/visites.js', import.meta.url), 'utf8');
  let requested;
  const context = vm.createContext({ URLSearchParams, console, TABLES: { VISITES: 'visits' }, requireAuth: () => ({ name: 'Test' }), escapeFormula: x => x, airtable: async path => { requested = path; return { records: [{ id: 'record101' }], offset: 'next-page' }; }, json: (status, body) => ({ status, body }), badRequest: x => x, serverError: e => { throw e; } });
  vm.runInContext(text.replace(/^import[\s\S]*?from '[^']+';\n/gm, '').replace('export const handler', 'const handler') + '\nthis.run = handler;', context);
  const result = await context.run({ httpMethod: 'GET', path: '/api/visites', queryStringParameters: { when: 'all', offset: 'page-2' } });
  assert.equal(new URL('https://test' + requested).searchParams.get('offset'), 'page-2');
  assert.equal(result.body.offset, 'next-page');
});
test('Tableau de bord : charge les visites au-delà des 100 premières', async () => {
  const dashboardHtml = await readFile(new URL('../public/dashboard.html', import.meta.url), 'utf8');
  const dashboardJs = await readFile(new URL('../public/js/dashboard.js', import.meta.url), 'utf8');
  const dom = new JSDOM(dashboardHtml, { url: 'https://example.test/dashboard.html', runScripts: 'outside-only' });
  const w = dom.window, requests = [];
  try {
    Object.assign(w, { escapeHtml, getOptionName, fmtDate, toast() {} });
    w.api = { get: async path => {
      if (path === '/me') return { name: 'Test' };
      requests.push(path);
      const second = path.includes('offset=page2');
      return { records: Array.from({ length: second ? 1 : 100 }, (_, i) => ({ id: 'rec' + (second ? 101 : i), fields: { Client: 'Test ' + i } })), offset: second ? null : 'page2' };
    } };
    w.eval(dashboardJs.replace(/^import .*;\n/, '') + '\nwindow.loadVisits = load;');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(w.document.querySelectorAll('.visite-item').length, 100);
    await w.loadVisits('all', '', true);
    assert.equal(w.document.querySelectorAll('.visite-item').length, 101);
    assert.match(requests.at(-1), /offset=page2/);
    assert.equal(w.document.getElementById('loadMore').hidden, true);
  } finally { w.close(); }
});
