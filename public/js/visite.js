import { api, toast, escapeHtml, getOptionName } from '/js/api.js';
import { initSignaturePad } from '/js/signature.js';
import { generatePdf } from '/js/pdf-generator.js';
import { openCroquisEditor } from '/js/croquis.js';
import {
  TYPES_PROJET, COMMON_SECTIONS, blocksForType, CHANTIER_STATUTS, materielFor, SPLIT_TYPES, computeDimensions
} from '/js/points-visite.js';

const params = new URLSearchParams(location.search);
const state = {
  id: params.get('id') || null,
  newPhotos: [],        // { dataUrl, label }
  existingPhotos: [],    // { url|dataUrl, label, filename }
  newCroquis: [],       // { dataUrl, label }  (croquis dessinés cette session)
  existingCroquis: [],   // { url, filename, label }  (croquis déjà enregistrés sur Airtable)
  materiel: [],          // { designation, quantite, note }
  taches: [],            // { label, done }
  splitsInt: [],         // PAC Air/Air : { emplacement, type, frigoM, elecM, puissance }
  clientProspectId: null,    // ID de la fiche Client/Prospect liée (table dédiée visites)
  clientProspectName: '',
  gps: null,
  userName: '',
  quotaWarned: false
};
let storageKey = `visite:${state.id || 'new'}`;

// ===== Auth =====
const meReady = api.get('/me')
  .then(u => { state.userName = u.name; })
  .catch(() => { location.href = '/'; });

// ===== Rendu des champs =====
function renderField(f) {
  const inputMode = f.inputMode ? ` inputmode="${f.inputMode}"` : '';
  const common = `data-key="${f.key}"${f.step ? ` step="${f.step}"` : ''}${inputMode}`;
  let control;
  if (f.type === 'textarea') {
    control = f.voice
      ? `<div class="with-voice"><textarea ${common} data-voice="1" rows="3"></textarea></div>`
      : `<textarea ${common} rows="3"></textarea>`;
  } else if (f.type === 'select') {
    const opts = ['<option value="">--</option>']
      .concat((f.options || []).map(o => `<option>${escapeHtml(o)}</option>`)).join('');
    control = `<select ${common}>${opts}</select>`;
  } else if (f.type === 'segmented') {
    control = `<div class="seg seg-inline">` + (f.options || []).map(o => `
      <label><input type="radio" name="${f.key}" data-key="${f.key}" value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></label>`).join('') + `</div>`;
  } else if (f.type === 'unit-list') {
    control = `<div id="${f.key}List" class="unit-list"></div>
      <button class="btn ghost small" type="button" id="${f.key}Add" style="margin-top:6px;">+ Ajouter une unité intérieure</button>`;
  } else {
    control = `<input type="${f.type}" ${common}${f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ''}>`;
  }
  return `<div class="field${f.full ? ' full' : ''}"><label>${escapeHtml(f.label)}</label>${control}${f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : ''}</div>`;
}

function renderSection(s, isType) {
  const body = `<div class="section-body"><div class="grid-2">${s.fields.map(renderField).join('')}</div></div>`;
  const tag = isType ? `<span class="section-tag">spécifique</span>` : '';
  return `<details class="section"${s.open || isType ? ' open' : ''}><summary>${s.icon || ''} ${escapeHtml(s.title)} ${tag}</summary>${body}</details>`;
}

function renderCommon() {
  document.getElementById('commonSections').innerHTML = COMMON_SECTIONS.map(s => renderSection(s, false)).join('');
}

function renderTypeSections(type) {
  const blocks = blocksForType(type);
  const cont = document.getElementById('typeSections');
  cont.innerHTML = blocks.map(b => renderSection(b, true)).join('');
  document.getElementById('typeHint').style.display = (type && blocks.length === 0) || !type ? 'block' : 'none';
  attachVoiceButtons(cont);
  wireSplitsInt(); // PAC Air/Air : liste répétable des splits si présente
}

// ===== Données (collect / apply) =====
function collectData() {
  const d = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    if (el.type === 'radio') { if (el.checked) d[k] = el.value; }
    else { d[k] = el.value; }
  });
  if (state.refClient) d.refClient = state.refClient;
  return d;
}

function applyData(d) {
  if (!d) return;
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    if (d[k] === undefined || d[k] === null) return;
    if (el.type === 'radio') { el.checked = (el.value === d[k]); }
    else el.value = d[k];
  });
  if (d.refClient) state.refClient = d.refClient;
  updateSeg();
}

function setVal(key, value) {
  if (value == null || value === '') return;
  const el = document.querySelector(`[data-key="${key}"]`);
  if (el && !el.value) el.value = value;
}

// ===== Faisabilité (segmented) =====
function updateSeg() {
  const sel = document.querySelector('input[name="faisabilite"]:checked');
  document.querySelectorAll('#faisaSeg label').forEach(l => {
    l.classList.remove('sel-faisable', 'sel-conditions', 'sel-non');
  });
  if (!sel) return;
  const lab = sel.closest('label');
  if (sel.value === 'Faisable') lab.classList.add('sel-faisable');
  else if (sel.value === 'Faisable sous conditions') lab.classList.add('sel-conditions');
  else if (sel.value === 'Non faisable') lab.classList.add('sel-non');
}

// ===== Dictée vocale (Web Speech API) =====
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
function attachVoiceButtons(root = document) {
  if (!SpeechRec) return;
  root.querySelectorAll('textarea[data-voice="1"]').forEach(ta => {
    if (ta._voiceWired) return;
    ta._voiceWired = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.textContent = '🎤';
    btn.title = 'Dictée vocale';
    ta.parentElement.appendChild(btn);
    let rec = null;
    btn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SpeechRec();
      rec.lang = 'fr-FR';
      rec.interimResults = false;
      rec.continuous = true;
      btn.classList.add('rec');
      rec.onresult = (e) => {
        let txt = '';
        for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
        ta.value = (ta.value ? ta.value.trim() + ' ' : '') + txt.trim();
        scheduleSave();
      };
      rec.onerror = () => { btn.classList.remove('rec'); rec = null; };
      rec.onend = () => { btn.classList.remove('rec'); rec = null; };
      rec.start();
    });
  });
}

// ===== Photos =====
function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function compressImage(file, max = 1200, quality = 0.72) {
  const img = await loadImage(await readFile(file));
  let { width, height } = img;
  if (width > max || height > max) {
    const r = Math.min(max / width, max / height);
    width = Math.round(width * r); height = Math.round(height * r);
  }
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d').drawImage(img, 0, 0, width, height);
  return c.toDataURL('image/jpeg', quality);
}

function renderPhotos() {
  const grid = document.getElementById('photosGrid');
  // Photos déjà enregistrées : on n'affiche l'aperçu que si on a la dataURL locale
  // (les URLs Airtable externes sont bloquées par la CSP -> placeholder libellé).
  const ex = state.existingPhotos.map((p) => {
    const visual = p.dataUrl
      ? `<img src="${p.dataUrl}" alt="">`
      : `<div class="photo-ph">📎<span>Photo enregistrée</span></div>`;
    return `<div class="photo-item">${visual}<div class="pcap"><input type="text" value="${escapeHtml(p.label || '')}" readonly></div></div>`;
  }).join('');
  const nw = state.newPhotos.map((p, i) => `
    <div class="photo-item">
      <img src="${p.dataUrl}" alt="">
      <div class="pcap">
        <input type="text" data-photo="${i}" placeholder="Libellé (ex: tableau élec.)" value="${escapeHtml(p.label || '')}">
        <button class="btn ghost small" data-del="${i}">Supprimer</button>
      </div>
    </div>`).join('');
  grid.innerHTML = ex + nw;
  grid.querySelectorAll('input[data-photo]').forEach(inp => {
    inp.addEventListener('input', () => { state.newPhotos[+inp.dataset.photo].label = inp.value; scheduleSave(); });
  });
  grid.querySelectorAll('button[data-del]').forEach(b => {
    b.addEventListener('click', () => { state.newPhotos.splice(+b.dataset.del, 1); renderPhotos(); scheduleSave(); });
  });
}

async function addPhotos(files) {
  for (const file of files) {
    try {
      const dataUrl = await compressImage(file);
      state.newPhotos.push({ dataUrl, label: '' });
    } catch { toast('Photo illisible ignorée', 'danger'); }
  }
  renderPhotos();
  scheduleSave();
}

// ===== Croquis & schémas =====
function renderCroquis() {
  const grid = document.getElementById('croquisGrid');
  if (!grid) return;
  const ex = state.existingCroquis.map(c => `
    <div class="croquis-item">
      <div class="croquis-ph">📎<span>Croquis enregistré</span></div>
      <div class="ccap"><input type="text" value="${escapeHtml(c.label || '')}" readonly></div>
    </div>`).join('');
  const nw = state.newCroquis.map((c, i) => `
    <div class="croquis-item">
      <img src="${c.dataUrl}" alt="croquis" data-cqedit="${i}">
      <div class="ccap">
        <input type="text" data-cq="${i}" placeholder="Libellé (ex: salon)" value="${escapeHtml(c.label || '')}">
        <button class="btn ghost small" type="button" data-cqdel="${i}" title="Supprimer">×</button>
      </div>
    </div>`).join('');
  grid.innerHTML = ex + nw;
  grid.querySelectorAll('input[data-cq]').forEach(inp => {
    inp.addEventListener('input', () => { state.newCroquis[+inp.dataset.cq].label = inp.value; scheduleSave(); });
  });
  grid.querySelectorAll('button[data-cqdel]').forEach(b => {
    b.addEventListener('click', () => { state.newCroquis.splice(+b.dataset.cqdel, 1); renderCroquis(); scheduleSave(); });
  });
  grid.querySelectorAll('img[data-cqedit]').forEach(img => {
    img.addEventListener('click', () => {
      const i = +img.dataset.cqedit;
      openCroquisEditor({
        initialDataUrl: state.newCroquis[i].dataUrl,
        onSave: (dataUrl) => { state.newCroquis[i].dataUrl = dataUrl; renderCroquis(); scheduleSave(); }
      });
    });
  });
}

function openNewCroquis() {
  openCroquisEditor({
    onSave: (dataUrl) => { state.newCroquis.push({ dataUrl, label: '' }); renderCroquis(); scheduleSave(); }
  });
}

// ===== Matériel à prévoir =====
function renderMateriel() {
  const list = document.getElementById('materielList');
  if (!list) return;
  list.innerHTML = state.materiel.map((m, i) => `
    <div class="line-item">
      <input type="text" data-mat="${i}" data-f="designation" placeholder="Désignation" value="${escapeHtml(m.designation || '')}">
      <input type="text" class="qty" data-mat="${i}" data-f="quantite" placeholder="Qté" value="${escapeHtml(m.quantite || '')}">
      <input type="text" data-mat="${i}" data-f="note" placeholder="Note" value="${escapeHtml(m.note || '')}">
      <button type="button" class="del" data-matdel="${i}" title="Supprimer">×</button>
    </div>`).join('');
  list.querySelectorAll('input[data-mat]').forEach(inp => {
    inp.addEventListener('input', () => { state.materiel[+inp.dataset.mat][inp.dataset.f] = inp.value; scheduleSave(); });
  });
  list.querySelectorAll('button[data-matdel]').forEach(b => {
    b.addEventListener('click', () => { state.materiel.splice(+b.dataset.matdel, 1); renderMateriel(); scheduleSave(); });
  });
}

function suggestMateriel() {
  const type = document.getElementById('typeProjet').value;
  const sugg = materielFor(type);
  if (!sugg.length) { toast('Aucune suggestion pour ce type', 'danger'); return; }
  const existing = new Set(state.materiel.map(m => (m.designation || '').trim().toLowerCase()));
  let added = 0;
  sugg.forEach(d => { if (!existing.has(d.toLowerCase())) { state.materiel.push({ designation: d, quantite: '1', note: '' }); added++; } });
  renderMateriel();
  scheduleSave();
  toast(added ? `${added} ligne(s) ajoutée(s)` : 'Déjà présent', added ? 'success' : '');
}

// ===== Travaux préalables (checklist) =====
function renderTaches() {
  const list = document.getElementById('tachesList');
  if (!list) return;
  list.innerHTML = state.taches.map((t, i) => `
    <div class="tache-item${t.done ? ' done' : ''}">
      <input type="checkbox" data-tdone="${i}"${t.done ? ' checked' : ''}>
      <input type="text" data-tlabel="${i}" placeholder="Travail / point à lever" value="${escapeHtml(t.label || '')}">
      <button type="button" class="del" data-tdel="${i}" title="Supprimer">×</button>
    </div>`).join('');
  list.querySelectorAll('input[data-tdone]').forEach(cb => {
    cb.addEventListener('change', () => { state.taches[+cb.dataset.tdone].done = cb.checked; renderTaches(); scheduleSave(); });
  });
  list.querySelectorAll('input[data-tlabel]').forEach(inp => {
    inp.addEventListener('input', () => { state.taches[+inp.dataset.tlabel].label = inp.value; scheduleSave(); });
  });
  list.querySelectorAll('button[data-tdel]').forEach(b => {
    b.addEventListener('click', () => { state.taches.splice(+b.dataset.tdel, 1); renderTaches(); scheduleSave(); });
  });
}

// ===== Unités intérieures PAC Air/Air (1 ligne = 1 split) =====
function renderSplitsInt() {
  const list = document.getElementById('splitsIntList');
  if (!list) return;
  list.innerHTML = state.splitsInt.map((u, i) => `
    <div class="split-row">
      <div class="split-head">
        <strong>Unité ${i + 1}</strong>
        <button type="button" class="del" data-spidel="${i}" title="Supprimer">×</button>
      </div>
      <input type="text" class="split-place" data-spi="${i}" data-f="emplacement" placeholder="Pièce / emplacement (ex: salon)" value="${escapeHtml(u.emplacement || '')}">
      <div class="seg seg-inline split-types">
        ${SPLIT_TYPES.map(t => `<label><input type="radio" name="spi${i}type" data-spi="${i}" data-f="type" value="${t}"${u.type === t ? ' checked' : ''}><span>${t}</span></label>`).join('')}
      </div>
      <div class="split-metrics">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="frigoM" placeholder="Frigo (m)" value="${escapeHtml(u.frigoM || '')}">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="elecM" placeholder="Élec (m)" value="${escapeHtml(u.elecM || '')}">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="puissance" placeholder="Puissance (kW)" value="${escapeHtml(u.puissance || '')}">
      </div>
    </div>`).join('');
  list.querySelectorAll('input[data-spi]').forEach(inp => {
    const ev = inp.type === 'radio' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      if (inp.type === 'radio' && !inp.checked) return;
      state.splitsInt[+inp.dataset.spi][inp.dataset.f] = inp.value;
      scheduleSave();
    });
  });
  list.querySelectorAll('button[data-spidel]').forEach(b => {
    b.addEventListener('click', () => { state.splitsInt.splice(+b.dataset.spidel, 1); renderSplitsInt(); scheduleSave(); });
  });
}

function wireSplitsInt() {
  const addBtn = document.getElementById('splitsIntAdd');
  if (!addBtn) return; // pas une visite PAC Air/Air
  addBtn.addEventListener('click', () => { state.splitsInt.push({ emplacement: '', type: '', frigoM: '', elecM: '', puissance: '' }); renderSplitsInt(); scheduleSave(); renderDimensionnement(); });
  renderSplitsInt();
}

// ===== Dimensionnement (indicatif, recalculé en direct) =====
function currentDimensions() {
  const d = collectData();
  return computeDimensions(d.typeProjet || '', d, state.splitsInt);
}
function renderDimensionnement() {
  const host = document.getElementById('dimensionnementBody');
  if (!host) return;
  const lines = currentDimensions();
  if (!lines.length) {
    host.innerHTML = '<p class="muted">Sélectionnez le type de projet et renseignez surface / hauteur / isolation pour voir le dimensionnement.</p>';
    return;
  }
  host.innerHTML = lines.map(l => `
    <div class="dim-item">
      <div class="dim-label">${escapeHtml(l.label)}</div>
      <div class="dim-value">${escapeHtml(l.value)}</div>
      ${l.hint ? `<div class="dim-hint">${escapeHtml(l.hint)}</div>` : ''}
    </div>`).join('');
}

// ===== Sauvegarde locale (autosave) =====
let saveTimer;
function snapshot() {
  return {
    id: state.id,
    data: collectData(),
    sigTech: sigTech.isEmpty() ? '' : sigTech.toDataURL(),
    sigClient: sigClient.isEmpty() ? '' : sigClient.toDataURL(),
    newPhotos: state.newPhotos,
    newCroquis: state.newCroquis,
    materiel: state.materiel,
    taches: state.taches,
    splitsInt: state.splitsInt,
    clientProspectId: state.clientProspectId,
    clientProspectName: state.clientProspectName,
    gps: state.gps
  };
}
function persist() {
  const snap = snapshot();
  try {
    localStorage.setItem(storageKey, JSON.stringify(snap));
  } catch {
    // Quota dépassé (photos volumineuses) -> on sauve sans les photos
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...snap, newPhotos: [] }));
      if (!state.quotaWarned) { toast('Photos non sauvegardées localement (mémoire pleine)', 'danger'); state.quotaWarned = true; }
    } catch { /* abandon silencieux */ }
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  const st = document.getElementById('saveStatus');
  saveTimer = setTimeout(() => {
    persist();
    st.textContent = '💾 Sauvegardé';
    setTimeout(() => { st.textContent = '💾 Auto'; }, 1200);
  }, 700);
}

function migrateStorageKey() {
  const newKey = `visite:${state.id}`;
  if (newKey !== storageKey) {
    try { localStorage.removeItem(storageKey); } catch {}
    storageKey = newKey;
    history.replaceState(null, '', `/visite.html?id=${state.id}`);
  }
}

// ===== Validation =====
function flashField(el) {
  const card = el.closest('.card') || el.closest('details');
  const holder = el.closest('.field') || el.closest('.with-voice') || el.parentElement;
  holder.classList.add('field-error');
  if (card) card.classList.add('flash');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { holder.classList.remove('field-error'); if (card) card.classList.remove('flash'); }, 2600);
}
function showBanner(msgs) {
  const b = document.getElementById('errorBanner');
  if (!msgs.length) { b.classList.remove('show'); b.innerHTML = ''; return; }
  b.innerHTML = '<strong>Champs manquants :</strong> ' + msgs.join(' · ');
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 6000);
}

function validateFinal() {
  const problems = [];
  let firstEl = null;
  const fail = (el, label) => { problems.push(label); if (!firstEl) firstEl = el; };

  const clientEl = document.querySelector('[data-key="client"]');
  if (!clientEl.value.trim()) fail(clientEl, 'Nom du client');

  const typeEl = document.getElementById('typeProjet');
  if (!typeEl.value) fail(typeEl, 'Type de projet');

  if (!document.querySelector('input[name="faisabilite"]:checked')) fail(document.getElementById('faisaSeg'), 'Faisabilité');

  if (sigTech.isEmpty()) fail(document.getElementById('sigTechArea'), 'Signature technicien');
  if (sigClient.isEmpty()) fail(document.getElementById('sigClientArea'), 'Signature client');

  if (problems.length) {
    showBanner(problems);
    if (firstEl) flashField(firstEl);
    toast('Complétez les champs manquants', 'danger');
    return false;
  }
  showBanner([]);
  return true;
}

// ===== Construction des champs Airtable =====
function buildFields(statut) {
  const d = collectData();
  const f = {
    'Client': d.client || '',
    'Téléphone': d.telephone || '',
    'Email': d.email || '',
    'Adresse': d.adresse || '',
    'Type de logement': d.typeLogement || '',
    'Type de projet': d.typeProjet || '',
    'Date visite': d.dateVisite || new Date().toISOString().slice(0, 10),
    'Technicien': d.technicien || state.userName,
    'Statut': statut,
    'Faisabilité': d.faisabilite || '',
    'Estimation budgétaire': d.estimation || '',
    'Délai indicatif': d.delai || '',
    'Statut chantier': d.statutChantier || '',
    'Date pose prévue': d.datePosePrevue || '',
    'Équipe pose': d.equipePose || '',
    'Réponses (JSON)': JSON.stringify({
      answers: d,
      photoLabels: state.newPhotos.map(p => p.label).filter(Boolean),
      croquisLabels: state.newCroquis.map(c => c.label).filter(Boolean),
      materiel: state.materiel.filter(m => (m.designation || '').trim()),
      taches: state.taches.filter(t => (t.label || '').trim()),
      splitsInt: state.splitsInt.filter(u => (u.emplacement || u.type || u.frigoM || u.elecM || '').toString().trim()),
      gps: state.gps
    }),
    'Signature technicien': sigTech.isEmpty() ? '' : sigTech.toDataURL(),
    'Signature client': sigClient.isEmpty() ? '' : sigClient.toDataURL()
  };
  if (state.refClient) f['Réf. client (Abonnements)'] = state.refClient;
  if (state.clientProspectId) f['Client/Prospect'] = [state.clientProspectId];
  Object.keys(f).forEach(k => { if (f[k] === '' || f[k] == null) delete f[k]; });
  return f;
}

// ===== PDF =====
function buildPdfPayload() {
  const d = collectData();
  const type = d.typeProjet || '';
  const sections = [];
  const toRows = (fields) => fields
    .map(fl => [fl.label, d[fl.key]])
    .filter(([, v]) => v != null && String(v).trim() !== '');
  COMMON_SECTIONS.forEach(s => { const rows = toRows(s.fields); if (rows.length) sections.push({ title: s.title, rows }); });
  blocksForType(type).forEach(b => { const rows = toRows(b.fields); if (rows.length) sections.push({ title: b.title, rows }); });

  const photos = state.existingPhotos.filter(p => p.dataUrl).map(p => ({ dataUrl: p.dataUrl, label: p.label }))
    .concat(state.newPhotos.map(p => ({ dataUrl: p.dataUrl, label: p.label })));
  const croquis = state.existingCroquis.filter(c => c.dataUrl).map(c => ({ dataUrl: c.dataUrl, label: c.label }))
    .concat(state.newCroquis.map(c => ({ dataUrl: c.dataUrl, label: c.label })));

  return {
    type,
    technicien: d.technicien || state.userName,
    dateVisite: d.dateVisite,
    client: { nom: d.client, tel: d.telephone, email: d.email, adresse: d.adresse },
    sections,
    faisabilite: d.faisabilite || '',
    estimation: d.estimation || '',
    delai: d.delai || '',
    reserves: d.reserves || '',
    recommandations: d.recommandations || '',
    chantier: {
      statut: d.statutChantier || '',
      datePose: d.datePosePrevue || '',
      equipe: d.equipePose || '',
      duree: d.poseDuree || '',
      materiel: state.materiel.filter(m => (m.designation || '').trim()),
      taches: state.taches.filter(t => (t.label || '').trim())
    },
    splitsInt: state.splitsInt.filter(u => (u.emplacement || u.type || u.frigoM || u.elecM || '').toString().trim()),
    dimensionnement: currentDimensions(),
    croquis,
    gps: state.gps,
    photos,
    sigTech: sigTech.isEmpty() ? '' : sigTech.toDataURL(),
    sigClient: sigClient.isEmpty() ? '' : sigClient.toDataURL()
  };
}

function pdfFilename(d) {
  const nom = (d.client || 'client').replace(/[^a-z0-9]/gi, '_');
  const date = d.dateVisite || new Date().toISOString().slice(0, 10);
  return `visite_${nom}_${date}.pdf`;
}

// ===== Sauvegarde serveur =====
async function saveRecord(statut) {
  const fields = buildFields(statut);
  let rec;
  if (state.id) {
    ({ visite: rec } = await api.patch(`/visites/${state.id}`, { fields }));
  } else {
    ({ visite: rec } = await api.post('/visites', { fields }));
    state.id = rec.id;
    migrateStorageKey();
  }
  // Upload des nouvelles photos (append) puis bascule en "existantes"
  for (const p of state.newPhotos) {
    const base64 = p.dataUrl.split(',')[1];
    const fname = (p.label ? p.label.replace(/[^a-z0-9]/gi, '_') : 'photo') + '.jpg';
    try { await api.post('/upload-photo', { visiteId: state.id, photoBase64: base64, filename: fname }); }
    catch (e) { console.error('upload photo', e); }
  }
  state.existingPhotos.push(...state.newPhotos.map(p => ({ dataUrl: p.dataUrl, label: p.label })));
  state.newPhotos = [];
  renderPhotos();
  // Upload des nouveaux croquis (append) puis bascule en "existants"
  for (const c of state.newCroquis) {
    const base64 = c.dataUrl.split(',')[1];
    const fname = (c.label ? c.label.replace(/[^a-z0-9]/gi, '_') : 'croquis') + '.png';
    try { await api.post('/upload-croquis', { visiteId: state.id, croquisBase64: base64, filename: fname }); }
    catch (e) { console.error('upload croquis', e); }
  }
  state.existingCroquis.push(...state.newCroquis.map(c => ({ dataUrl: c.dataUrl, label: c.label })));
  state.newCroquis = [];
  renderCroquis();
  return rec;
}

// ===== Boutons =====
function busy(btn, label) { btn.disabled = true; btn._old = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${label}`; }
function unbusy(btn) { btn.disabled = false; if (btn._old) btn.innerHTML = btn._old; }

async function onDraft() {
  const btn = document.getElementById('draftBtn');
  const clientEl = document.querySelector('[data-key="client"]');
  if (!clientEl.value.trim()) { flashField(clientEl); toast('Nom du client requis', 'danger'); return; }
  busy(btn, 'Sauvegarde...');
  try {
    await saveRecord('Brouillon');
    persist();
    toast('Brouillon enregistré', 'success');
  } catch (e) { toast(e.message, 'danger'); }
  finally { unbusy(btn); }
}

async function onPreview() {
  // Sur mobile, doc.output('dataurlnewwindow') ouvre souvent une page blanche
  // (data URL trop longue, blocage popup) → on télécharge le PDF, l'OS l'ouvre.
  const btn = document.getElementById('previewBtn');
  busy(btn, 'PDF...');
  try {
    const doc = await generatePdf(buildPdfPayload());
    doc.save('apercu-' + pdfFilename(collectData()));
    toast('PDF d\'aperçu téléchargé', 'success');
  } catch (e) { console.error(e); toast('Erreur PDF: ' + e.message, 'danger'); }
  finally { unbusy(btn); }
}

async function onFinalize() {
  if (!validateFinal()) return;
  const btn = document.getElementById('finalizeBtn');
  busy(btn, 'Enregistrement...');
  try {
    const d = collectData();
    await saveRecord('Terminée');

    busy(btn, 'PDF...');
    const doc = await generatePdf(buildPdfPayload());
    const fname = pdfFilename(d);
    doc.save(fname);
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    try { await api.post('/upload-pdf', { visiteId: state.id, pdfBase64, filename: fname }); }
    catch (e) { console.error('upload pdf', e); toast('PDF généré mais non envoyé à Airtable', 'danger'); }

    try { localStorage.removeItem(storageKey); } catch {}
    toast('✅ Visite enregistrée', 'success');
    setTimeout(() => { location.href = '/dashboard.html'; }, 1400);
  } catch (e) {
    console.error(e);
    toast('Erreur: ' + e.message, 'danger');
    unbusy(btn);
  }
}

// ===== Client/Prospect (table dédiée Visites) =====
function linkProspect(id, fields) {
  state.clientProspectId = id;
  state.clientProspectName = (fields && fields['Nom complet']) || 'Client lié';
  refreshProspectChip();
  // Pré-remplir les champs vides de la fiche visite
  if (fields) {
    setVal('client', fields['Nom complet']);
    setVal('telephone', fields['Téléphone']);
    setVal('email', fields['Email']);
    const adr = [fields['Adresse'] || '', `${fields['Code postal'] || ''} ${fields['Ville'] || ''}`.trim()].filter(Boolean).join('\n');
    setVal('adresse', adr);
  }
  scheduleSave();
}

function refreshProspectChip() {
  const chip = document.getElementById('prospectChip');
  if (!chip) return;
  if (state.clientProspectId) {
    chip.querySelector('.prospect-name').textContent = state.clientProspectName || 'Client lié';
    chip.style.display = 'inline-flex';
    const cBtn = document.getElementById('prospectCreate');
    if (cBtn) cBtn.style.display = 'none';
  } else {
    chip.style.display = 'none';
  }
}

let prospectTimer;
function wireProspectSearch() {
  const inp = document.getElementById('prospectSearch');
  const res = document.getElementById('prospectResults');
  const createBtn = document.getElementById('prospectCreate');
  const unlinkBtn = document.getElementById('prospectUnlink');
  if (!inp) return;

  inp.addEventListener('input', () => {
    clearTimeout(prospectTimer);
    const q = inp.value.trim();
    createBtn.style.display = (!state.clientProspectId && q.length >= 2) ? 'inline-flex' : 'none';
    if (q.length < 2) { res.innerHTML = ''; return; }
    prospectTimer = setTimeout(async () => {
      try {
        const { records } = await api.get(`/prospects?q=${encodeURIComponent(q)}`);
        if (!records.length) {
          res.innerHTML = '<p class="muted">Aucun client/prospect trouvé. Cliquez sur « Créer » pour l\'ajouter.</p>';
          return;
        }
        res.innerHTML = records.map(r => {
          const f = r.fields;
          const meta = [f['Ville'] || '', f['Code postal'] || '', f['Téléphone'] || ''].filter(Boolean).join(' · ');
          return `<div class="visite-item" data-pid="${r.id}">
            <div class="info">
              <div class="name">${escapeHtml(f['Nom complet'] || '')}</div>
              <div class="meta">${escapeHtml(meta)}</div>
            </div>
            <span class="badge">Choisir</span>
          </div>`;
        }).join('');
        res.querySelectorAll('[data-pid]').forEach(el => {
          el.addEventListener('click', () => {
            const r = records.find(x => x.id === el.dataset.pid);
            linkProspect(r.id, r.fields);
            res.innerHTML = '';
            inp.value = '';
            createBtn.style.display = 'none';
            toast('Client/prospect lié', 'success');
          });
        });
      } catch { /* silencieux */ }
    }, 300);
  });

  createBtn.addEventListener('click', async () => {
    const d = collectData();
    const nom = (d.client || inp.value || '').trim();
    if (!nom) { toast('Saisir le nom du client (section ci-dessous) avant de créer', 'danger'); return; }
    busy(createBtn, 'Création...');
    try {
      const fields = { 'Nom complet': nom, 'Origine': 'Prospect' };
      if (d.telephone) fields['Téléphone'] = d.telephone;
      if (d.email) fields['Email'] = d.email;
      if (d.adresse) fields['Adresse'] = d.adresse;
      const { prospect } = await api.post('/prospects', { fields });
      linkProspect(prospect.id, prospect.fields);
      inp.value = '';
      res.innerHTML = '';
      toast('Client/prospect créé et lié', 'success');
    } catch (e) { toast('Erreur création: ' + e.message, 'danger'); }
    finally { unbusy(createBtn); }
  });

  unlinkBtn.addEventListener('click', () => {
    state.clientProspectId = null;
    state.clientProspectName = '';
    refreshProspectChip();
    scheduleSave();
  });
}

// ===== Recherche client maintenance (Entretien & Ramonage, lecture seule) =====
let clientTimer;
function wireClientSearch() {
  const inp = document.getElementById('clientSearch');
  const res = document.getElementById('clientResults');
  inp.addEventListener('input', () => {
    clearTimeout(clientTimer);
    const q = inp.value.trim();
    if (q.length < 2) { res.innerHTML = ''; return; }
    clientTimer = setTimeout(async () => {
      try {
        const { records } = await api.get(`/clients?q=${encodeURIComponent(q)}`);
        if (!records.length) { res.innerHTML = '<p class="muted">Aucun client trouvé</p>'; return; }
        res.innerHTML = records.map(r => {
          const f = r.fields;
          return `<div class="visite-item" data-cid="${r.id}">
            <div class="info"><div class="name">${escapeHtml(f['Nom complet'] || '')}</div>
            <div class="meta">${escapeHtml((f['Ville'] || '') + ' ' + (f['Code postal'] || ''))} · ${escapeHtml(f['Téléphone'] || '')}</div></div>
            <span class="badge">Choisir</span></div>`;
        }).join('');
        res.querySelectorAll('[data-cid]').forEach(el => {
          el.addEventListener('click', () => {
            const r = records.find(x => x.id === el.dataset.cid); const f = r.fields;
            setVal('client', f['Nom complet']);
            setVal('telephone', f['Téléphone']);
            setVal('email', f['Email']);
            const adr = [f['Adresse'] || f["Adresse d'intervention"], `${f['Code postal'] || ''} ${f['Ville'] || ''}`.trim()].filter(Boolean).join('\n');
            setVal('adresse', adr);
            state.refClient = `${f['Nom complet'] || ''} (${r.id})`;
            res.innerHTML = '';
            inp.value = '';
            toast('Client pré-rempli', 'success');
            scheduleSave();
          });
        });
      } catch (e) { /* base maintenance indispo: silencieux */ }
    }, 300);
  });
}

// ===== Init =====
let sigTech, sigClient;

(async function init() {
  await meReady;

  // Select type
  document.getElementById('typeProjet').innerHTML =
    '<option value="">— Choisir le type d\'installation —</option>' +
    TYPES_PROJET.map(t => `<option>${escapeHtml(t)}</option>`).join('');

  // Select statut chantier
  document.querySelector('[data-key="statutChantier"]').innerHTML =
    '<option value="">— Non démarré —</option>' +
    CHANTIER_STATUTS.map(s => `<option>${escapeHtml(s)}</option>`).join('');

  renderCommon();
  attachVoiceButtons(document); // pour les textareas statiques (réserves, recommandations)

  // Signatures
  sigTech = initSignaturePad(document.getElementById('sigTech'), document.getElementById('sigTechPh'));
  sigClient = initSignaturePad(document.getElementById('sigClient'), document.getElementById('sigClientPh'));

  // Données initiales : Airtable (?id) sinon brouillon local
  let initial = null;
  let colOverride = null;
  if (state.id) {
    try {
      const { visite } = await api.get(`/visites/${state.id}`);
      const f = visite.fields || {};
      let parsed = {};
      try { parsed = JSON.parse(f['Réponses (JSON)'] || '{}'); } catch {}
      initial = { data: parsed.answers || {}, sigTech: f['Signature technicien'], sigClient: f['Signature client'] };
      // photos existantes (Airtable) en lecture seule
      (f['Photos'] || []).forEach(att => state.existingPhotos.push({ url: att.url, filename: att.filename, label: att.filename }));
      // croquis existants (Airtable) en lecture seule (CSP : pas d'affichage direct)
      (f['Croquis'] || []).forEach(att => state.existingCroquis.push({ url: att.url, filename: att.filename, label: att.filename }));
      state.materiel = parsed.materiel || [];
      state.taches = parsed.taches || [];
      state.splitsInt = parsed.splitsInt || [];
      if (parsed.gps) state.gps = parsed.gps;
      // Lien Client/Prospect (table dédiée visites)
      const linked = (f['Client/Prospect'] || [])[0];
      if (linked) {
        state.clientProspectId = linked;
        try {
          const { prospect } = await api.get(`/prospects/${linked}`);
          state.clientProspectName = (prospect.fields && prospect.fields['Nom complet']) || 'Client lié';
        } catch { state.clientProspectName = 'Client lié'; }
      }
      // Les colonnes Airtable (modifiables côté Airtable) font autorité au ré-affichage
      colOverride = {
        statutChantier: getOptionName(f['Statut chantier']),
        datePosePrevue: f['Date pose prévue'] || '',
        equipePose: f['Équipe pose'] || ''
      };
    } catch (e) { toast('Visite introuvable', 'danger'); }
  } else {
    try { initial = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch {}
    if (initial) {
      state.newPhotos = initial.newPhotos || [];
      state.newCroquis = initial.newCroquis || [];
      state.materiel = initial.materiel || [];
      state.taches = initial.taches || [];
      state.splitsInt = initial.splitsInt || [];
      state.clientProspectId = initial.clientProspectId || null;
      state.clientProspectName = initial.clientProspectName || '';
      state.gps = initial.gps || null;
    }
  }

  // Type d'abord (pour rendre les bonnes sections), puis le reste
  const typeVal = initial?.data?.typeProjet || '';
  document.getElementById('typeProjet').value = typeVal;
  renderTypeSections(typeVal);

  // Technicien par défaut + date du jour
  setVal('technicien', state.userName);
  setVal('dateVisite', new Date().toISOString().slice(0, 10));

  if (initial?.data) applyData(initial.data);
  // Les colonnes Airtable (statut chantier / pose) priment sur le JSON au ré-affichage
  if (colOverride) {
    for (const [k, v] of Object.entries(colOverride)) {
      const el = document.querySelector(`[data-key="${k}"]`);
      if (el) el.value = v;
    }
  }
  if (initial?.sigTech) sigTech.fromDataURL(initial.sigTech);
  if (initial?.sigClient) sigClient.fromDataURL(initial.sigClient);
  updateSeg();
  renderPhotos();
  renderCroquis();
  renderMateriel();
  renderTaches();
  renderDimensionnement();
  if (state.gps) document.getElementById('gpsLabel').textContent = `(${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)})`;

  // ===== Events =====
  document.getElementById('typeProjet').addEventListener('change', (e) => {
    const cur = collectData();          // garde les réponses déjà saisies
    renderTypeSections(e.target.value);
    applyData(cur);                      // ré-applique (les communes + celles encore présentes)
    scheduleSave();
    renderDimensionnement();
  });

  document.addEventListener('input', (e) => {
    if (e.target.name === 'faisabilite') updateSeg();
    scheduleSave();
    // Recalcul dimensionnement si un input clé change
    if (e.target.dataset && ['surface', 'hauteurPlafond', 'nbPieces', 'isolation', 'typeProjet'].includes(e.target.dataset.key)) {
      renderDimensionnement();
    }
  });
  document.addEventListener('change', (e) => {
    scheduleSave();
    if (e.target.dataset && ['typeProjet', 'isolation'].includes(e.target.dataset.key)) renderDimensionnement();
  });

  document.getElementById('photoInput').addEventListener('change', (e) => { addPhotos([...e.target.files]); e.target.value = ''; });
  document.getElementById('croquisAdd').addEventListener('click', openNewCroquis);
  document.getElementById('materielAdd').addEventListener('click', () => { state.materiel.push({ designation: '', quantite: '', note: '' }); renderMateriel(); });
  document.getElementById('materielSuggest').addEventListener('click', suggestMateriel);
  document.getElementById('tacheAdd').addEventListener('click', () => { state.taches.push({ label: '', done: false }); renderTaches(); });
  document.getElementById('gpsBtn').addEventListener('click', captureGps);
  document.getElementById('clearTech').addEventListener('click', () => { sigTech.clear(); scheduleSave(); });
  document.getElementById('clearClient').addEventListener('click', () => { sigClient.clear(); scheduleSave(); });
  document.getElementById('draftBtn').addEventListener('click', onDraft);
  document.getElementById('previewBtn').addEventListener('click', onPreview);
  document.getElementById('finalizeBtn').addEventListener('click', onFinalize);
  document.getElementById('backBtn').addEventListener('click', () => { location.href = '/dashboard.html'; });
  wireProspectSearch();
  wireClientSearch();
  refreshProspectChip();
})();

function captureGps() {
  if (!navigator.geolocation) { toast('Géolocalisation indisponible', 'danger'); return; }
  toast('Localisation...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById('gpsLabel').textContent = `(${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)})`;
      toast('Position enregistrée', 'success');
      scheduleSave();
    },
    () => toast('Position refusée', 'danger'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
