import { api, toast, escapeHtml, getOptionName, localDate } from '/js/api.js';
import { initSignaturePad } from '/js/signature.js';
import { generatePdf } from '/js/pdf-generator.js';
import { openCroquisEditor } from '/js/croquis.js';
import {
  TYPES_PROJET, COMMON_SECTIONS, blocksForType, CHANTIER_STATUTS, materielFor, SPLIT_TYPES, computeDimensions, TECH_REQUIRED
} from '/js/points-visite.js';

const params = new URLSearchParams(location.search);
const state = {
  id: params.get('id') || null,
  // Buffer accumulé de TOUTES les réponses saisies, y compris celles dont les
  // champs sont actuellement masqués (sections d'un autre Type de projet).
  // Permet de ne rien perdre quand on change de type puis qu'on y revient.
  answers: {},
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
let storageKey;
let ready = false, dirty = false, operation = false, finalized = false;
let attachmentsReady = Promise.resolve();
let baseAnswers = null;
let loadFailed = false;
let pendingMedia = 0;
const draftKey = () => `visite:${encodeURIComponent(state.userName)}:${state.id || 'new'}`;

// ===== Auth =====
const meReady = api.get('/me')
  .then(u => { state.userName = u.name; storageKey = draftKey(); return true; })
  .catch(() => { toast('Connexion nécessaire pour ouvrir la visite. Réessayez lorsque le réseau revient.', 'danger'); return false; });

// ===== Rendu des champs =====
function renderField(f) {
  const inputMode = f.inputMode ? ` inputmode="${f.inputMode}"` : '';
  const common = `id="field-${f.key}" aria-label="${escapeHtml(f.label)}" data-key="${f.key}"${f.step ? ` step="${f.step}"` : ''}${inputMode}`;
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
    control = `<details class="splits-help"><summary>ⓘ Comment remplir chaque unité intérieure ?</summary>
        <ul>
          <li><strong>Pièce / emplacement</strong> : où sera fixée l'unité intérieure (salon, chambre 1…).</li>
          <li><strong>Surface (m²)</strong> : surface de cette pièce. Sert au calcul de puissance par pièce.</li>
          <li><strong>Liaison frigo (m)</strong> : longueur du tube cuivre brasé/isolé reliant l'unité extérieure à cette unité intérieure.</li>
          <li><strong>Liaison élec (m)</strong> : longueur du câble multi-conducteurs (alim + communication, généralement <em>4G1,5 mm²</em>) entre l'unité ext. et l'unité int. C'est le câble qui pilote l'unité — distinct de l'alimentation depuis le tableau.</li>
          <li><strong>Puissance (kW)</strong> : puissance frigo/calo nominale de l'unité int. (optionnel — sinon dérivée de la surface).</li>
        </ul>
      </details>
      <div id="${f.key}List" class="unit-list"></div>
      <button class="btn ghost small" type="button" id="${f.key}Add" style="margin-top:6px;">+ Ajouter une unité intérieure</button>`;
  } else {
    control = `<input type="${f.type}" ${common}${f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ''}>`;
  }
  const infoBtn = f.info ? ` <button type="button" class="info-btn" data-info="${escapeHtml(f.info)}" aria-label="Plus d'infos">ⓘ</button>` : '';
  return `<div class="field${f.full ? ' full' : ''}"><label for="field-${f.key}">${escapeHtml(f.label)}${infoBtn}</label>${control}${f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : ''}</div>`;
}

function renderSection(s, isType) {
  const na = isType ? `<label class="section-na"><input type="checkbox" data-key="na_${s.id}"> Non applicable à ce projet</label>` : '';
  const body = `<div class="section-body">${na}<div class="grid-2">${s.fields.map(renderField).join('')}</div></div>`;
  const tag = isType ? `<span class="section-tag">spécifique</span>` : '';
  return `<details class="section"${s.open || isType ? ' open' : ''}><summary>${s.icon || ''} ${escapeHtml(s.title)} ${tag}</summary>${body}</details>`;
}

function renderCommon() {
  const host = document.getElementById('commonSections');
  const contactKeys = ['client', 'telephone', 'email', 'adresse'];
  const client = COMMON_SECTIONS.find(s => s.id === 'client');
  document.getElementById('clientFields').innerHTML = renderSection({ ...client, title: 'Coordonnées du client', fields: client.fields.filter(f => contactKeys.includes(f.key)) }, false);
  host.innerHTML = COMMON_SECTIONS.map(s => renderSection(s.id === 'client' ? { ...s, title: 'Logement', fields: s.fields.filter(f => !contactKeys.includes(f.key)) } : s, false)).join('');
  attachInfoButtons(host);
}

function renderTypeSections(type) {
  const blocks = blocksForType(type);
  const cont = document.getElementById('typeSections');
  cont.innerHTML = blocks.map(b => renderSection(b, true)).join('');
  document.getElementById('typeHint').style.display = (type && blocks.length === 0) || !type ? 'block' : 'none';
  attachVoiceButtons(cont);
  attachInfoButtons(cont);
  wireSplitsInt(); // PAC Air/Air : liste répétable des splits si présente
}

// ===== Info-bulles (ⓘ) cliquables =====
function showInfoPopover(target, text) {
  document.querySelectorAll('.info-popover').forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = 'info-popover';
  pop.innerHTML = `<button class="info-close" type="button" aria-label="Fermer">×</button><div class="info-text"></div>`;
  pop.querySelector('.info-text').textContent = text;
  document.body.appendChild(pop);
  const r = target.getBoundingClientRect();
  const W = Math.min(320, window.innerWidth - 16);
  pop.style.maxWidth = W + 'px';
  let left = r.left + window.scrollX;
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
  if (left < 8) left = 8;
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + window.scrollY + 8) + 'px';

  const close = () => {
    pop.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('touchstart', outside, true);
  };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== target) close(); };
  pop.querySelector('.info-close').addEventListener('click', close);
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('touchstart', outside, true);
  }, 0);
}
function attachInfoButtons(root = document) {
  root.querySelectorAll('.info-btn').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showInfoPopover(btn, btn.dataset.info || '');
    });
  });
}

// ===== Données (collect / apply) =====
// IMPORTANT : on accumule dans state.answers les réponses des champs visibles
// SANS écraser celles des champs masqués (autres types de projet). Comme ça,
// changer de type puis revenir conserve les saisies.
function collectData() {
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    if (el.type === 'checkbox') state.answers[k] = el.checked;
    else if (el.type === 'radio') { if (el.checked) state.answers[k] = el.value; }
    else state.answers[k] = el.value;
  });
  if (state.refClient) state.answers.refClient = state.refClient;
  return state.answers;
}

function applyData(d) {
  if (!d) return;
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key;
    if (d[k] === undefined || d[k] === null) return;
    if (el.type === 'checkbox') el.checked = d[k] === true;
    else if (el.type === 'radio') { el.checked = (el.value === d[k]); }
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
  if (state.existingPhotos.length === 0 && state.newPhotos.length === 0) {
    grid.innerHTML = '<div class="empty-state">Aucune photo. Cliquez sur « + Ajouter une ou plusieurs photos » ci-dessous.</div>';
    return;
  }
  // Photos déjà enregistrées : on n'affiche l'aperçu que si on a la dataURL locale
  // (les URLs Airtable externes sont bloquées par la CSP -> placeholder libellé).
  const ex = state.existingPhotos.map((p, i) => {
    const visual = p.dataUrl
      ? `<img src="${p.dataUrl}" alt="">`
      : `<div class="photo-ph">⏳<span>Chargement…</span><small>${escapeHtml(p.filename || '')}</small></div>`;
    const delBtn = p.id ? `<button class="photo-del" type="button" data-exphotodel="${i}" title="Supprimer la photo enregistrée">×</button>` : '';
    return `<div class="photo-item">${visual}<div class="attachment-label">${escapeHtml(p.label || '')}</div>${delBtn}</div>`;
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
  grid.querySelectorAll('button[data-exphotodel]').forEach(b => {
    b.addEventListener('click', async () => {
      const i = +b.dataset.exphotodel;
      const ph = state.existingPhotos[i];
      if (!ph || !ph.id) return;
      if (!confirm('Supprimer définitivement cette photo enregistrée ?')) return;
      b.disabled = true;
      try {
        await api.post('/delete-attachment', { visiteId: state.id, attId: ph.id, field: 'Photos' });
        state.existingPhotos.splice(i, 1);
        renderPhotos();
        scheduleSave(); toast('Photo supprimée');
      } catch (e) { b.disabled = false; toast('Erreur suppression', 'danger'); }
    });
  });
}

async function addPhotos(files) {
  pendingMedia++;  for (const file of files) {
    try {
      const dataUrl = await compressImage(file);
      state.newPhotos.push({ dataUrl, label: '' });
    } catch { toast('Photo illisible ignorée', 'danger'); }
  }
  renderPhotos();
  pendingMedia--;
  scheduleSave();
}

// ===== Croquis & schémas =====
function renderCroquis() {
  const grid = document.getElementById('croquisGrid');
  if (!grid) return;
  if (state.existingCroquis.length === 0 && state.newCroquis.length === 0) {
    grid.innerHTML = '<div class="empty-state">Aucun croquis encore. Cliquez sur « + Nouveau croquis » ci-dessous pour dessiner.</div>';
    return;
  }
  const ex = state.existingCroquis.map((c, i) => {
    const visual = c.dataUrl
      ? `<img src="${c.dataUrl}" alt="croquis">`
      : `<div class="croquis-ph">⏳<span>Chargement…</span><small>${escapeHtml(c.filename || '')}</small></div>`;
    const delBtn = c.id ? `<button class="photo-del" type="button" data-excqdel="${i}" title="Supprimer le croquis enregistré">×</button>` : '';
    return `<div class="croquis-item" style="position:relative;">${visual}<div class="attachment-label">${escapeHtml(c.label || '')}</div>${delBtn}</div>`;
  }).join('');
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
  grid.querySelectorAll('button[data-excqdel]').forEach(b => {
    b.addEventListener('click', async () => {
      const i = +b.dataset.excqdel;
      const cq = state.existingCroquis[i];
      if (!cq || !cq.id) return;
      if (!confirm('Supprimer définitivement ce croquis enregistré ?')) return;
      b.disabled = true;
      try {
        await api.post('/delete-attachment', { visiteId: state.id, attId: cq.id, field: 'Croquis' });
        state.existingCroquis.splice(i, 1);
        renderCroquis();
        scheduleSave(); toast('Croquis supprimé');
      } catch (e) { b.disabled = false; toast('Erreur suppression', 'danger'); }
    });
  });
}

// Charge en arrière-plan les photos/croquis déjà enregistrés (le serveur les proxie en dataURL).
async function loadExistingAttachments() {
  if (!state.id) return;
  if (!state.existingPhotos.length && !state.existingCroquis.length) return;
  try {
    const data = await api.get(`/visite-attachments?visiteId=${state.id}`);
    for (const ph of (data.photos || [])) {
      const t = state.existingPhotos.find(p => p.id === ph.id);
      if (t && ph.dataUrl) t.dataUrl = ph.dataUrl;
    }
    for (const cq of (data.croquis || [])) {
      const t = state.existingCroquis.find(c => c.id === cq.id);
      if (t && cq.dataUrl) t.dataUrl = cq.dataUrl;
    }
    renderPhotos();
    renderCroquis();
  } catch (e) {
    throw new Error('Photos ou croquis non chargés. Vérifiez la connexion puis réessayez.');
  }
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
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="surfacePiece" placeholder="Surface (m²)" value="${escapeHtml(u.surfacePiece || '')}">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="frigoM" placeholder="Frigo (m)" value="${escapeHtml(u.frigoM || '')}">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="elecM" placeholder="Liaison élec (m)" value="${escapeHtml(u.elecM || '')}">
        <input type="text" inputmode="decimal" data-spi="${i}" data-f="puissance" placeholder="Puissance (kW)" value="${escapeHtml(u.puissance || '')}">
      </div>
    </div>`).join('');
  list.querySelectorAll('input[data-spi]').forEach(inp => {
    const ev = inp.type === 'radio' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      if (inp.type === 'radio' && !inp.checked) return;
      state.splitsInt[+inp.dataset.spi][inp.dataset.f] = inp.value;
      scheduleSave();
      renderDimensionnement();
    });
  });
  list.querySelectorAll('button[data-spidel]').forEach(b => {
    b.addEventListener('click', () => { state.splitsInt.splice(+b.dataset.spidel, 1); renderSplitsInt(); scheduleSave(); renderDimensionnement(); });
  });
}

function wireSplitsInt() {
  const addBtn = document.getElementById('splitsIntAdd');
  if (!addBtn) return; // pas une visite PAC Air/Air
  addBtn.addEventListener('click', () => { state.splitsInt.push({ emplacement: '', surfacePiece: '', type: '', frigoM: '', elecM: '', puissance: '' }); renderSplitsInt(); scheduleSave(); renderDimensionnement(); });
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
  const dim = currentDimensions();
  if (dim.status === 'no-data') {
    host.innerHTML = '<p class="muted">Sélectionnez le type de projet et renseignez surface / hauteur / isolation / nb pièces pour voir le dimensionnement.</p>';
    return;
  }
  if (dim.status === 'incomplete') {
    host.innerHTML = `
      <div class="dim-blocked">
        <strong>⚠️ Calcul indisponible — données manquantes</strong>
        <p class="muted">Le dimensionnement n'est pas affiché pour ne pas inventer de valeurs. Complétez :</p>
        <ul>${dim.missing.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
      </div>`;
    return;
  }
  // status === 'ok'
  let html = '<div class="dim-lines">' + dim.lines.map(l => `
    <div class="dim-item">
      <div class="dim-label">${escapeHtml(l.label)}</div>
      <div class="dim-value">${escapeHtml(l.value)}</div>
      ${l.hint ? `<div class="dim-hint">${escapeHtml(l.hint)}</div>` : ''}
    </div>`).join('') + '</div>';
  if (dim.perRoom && dim.perRoom.length) {
    html += `
      <div class="dim-perroom">
        <h3>Détail par pièce</h3>
        <table>
          <thead><tr><th>Pièce</th><th>Surface</th><th>Puissance</th><th>Type d'unité</th></tr></thead>
          <tbody>${dim.perRoom.map(r => `<tr><td>${escapeHtml(r.emplacement)}</td><td>${r.surface} m²</td><td><strong>${r.puissance} kW</strong></td><td>${escapeHtml(r.type || '—')}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  }
  host.innerHTML = html;
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
function setSaveStatus(text) {
  document.getElementById('saveStatus').textContent = text;
  document.getElementById('visitProgressState').textContent = text;
}
function persist() {
  if (!ready || finalized) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...snapshot(), owner: state.userName, dirty, baseAnswers, savedAt: Date.now() }));
    if (dirty) setSaveStatus('Sur cet appareil · à envoyer');
    return true;
  } catch {
    setSaveStatus('Non sauvegardé · espace insuffisant');
    if (!state.quotaWarned) { toast('Stockage plein : enregistrez en ligne avant de quitter.', 'danger'); state.quotaWarned = true; }
    return false;
  }
}
function scheduleSave() {
  if (!ready || operation || finalized) return;
  dirty = true;
  setSaveStatus('Sauvegarde sur cet appareil…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
  renderReview();
}
function markSynced() {
  dirty = false;
  clearTimeout(saveTimer);
  try { localStorage.removeItem(storageKey); } catch {}
  setSaveStatus('Enregistré en ligne');
}
function migrateStorageKey() {
  const oldKey = storageKey;
  storageKey = draftKey();
  history.replaceState(null, '', `/visite.html?id=${state.id}`);
  // Conserver l'ancien brouillon si la copie échoue.
  if (persist() && oldKey !== storageKey) {
    try { localStorage.removeItem(oldKey); } catch {}
  }
}
function readLocalDraft() {
  try {
    let draft = JSON.parse(localStorage.getItem(storageKey) || 'null');
    // Migration des anciens brouillons uniquement si le technicien correspond.
    if (!draft) {
      const legacyKey = `visite:${state.id || 'new'}`;
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
      if (legacy?.data?.technicien === state.userName) {
        draft = { ...legacy, owner: state.userName, dirty: true };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        localStorage.removeItem(legacyKey);
      }
    }
    return draft?.owner === state.userName && draft.dirty !== false ? draft : null;
  } catch { return null; }
}
function restoreLocal(draft) {
  state.newPhotos = draft.newPhotos || [];
  state.newCroquis = draft.newCroquis || [];
  state.materiel = draft.materiel || [];
  state.taches = draft.taches || [];
  state.splitsInt = draft.splitsInt || [];
  state.clientProspectId = draft.clientProspectId || null;
  state.clientProspectName = draft.clientProspectName || '';
  state.gps = draft.gps || null;
  // Si la création avait réussi avant une interruption, reprendre le même dossier.
  if (!state.id && draft.id) { state.id = draft.id; storageKey = draftKey(); history.replaceState(null, '', `/visite.html?id=${state.id}`); }
  // Réconcilier les envois dont la réponse a pu être perdue.
  for (const [pending, existing] of [['newPhotos', 'existingPhotos'], ['newCroquis', 'existingCroquis']]) {
    state[pending] = state[pending].filter(p => {
      const uploaded = p.filename && state[existing].find(a => a.filename === p.filename);
      if (uploaded) { Object.assign(uploaded, p); return false; }
      return true;
    });
  }
  dirty = true;
}
window.addEventListener('pagehide', () => { if (dirty) { clearTimeout(saveTimer); persist(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) { clearTimeout(saveTimer); persist(); } });
window.addEventListener('beforeunload', e => {
  if (operation || (dirty && !persist())) { e.preventDefault(); e.returnValue = ''; }
});

// ===== Validation =====
function flashField(el) {
  const panel = el.closest('[data-visit-panel]');
  if (panel?.hidden) document.querySelector(`[data-visit-step="${panel.dataset.visitPanel}"]`)?.click();
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
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

function validationProblems() {
  const d = collectData(), problems = [];
  const add = (key, label) => problems.push({ key, label });
  if (!d.client?.trim()) add('client', 'Nom du client');
  if (!d.adresse?.trim()) add('adresse', 'Adresse du chantier');
  if (!d.typeProjet) add('typeProjet', 'Type de projet');
  if (!d.dateVisite) add('dateVisite', 'Date de visite');
  if (!d.faisabilite) add('faisabilite', 'Faisabilité');
  if (['Faisable sous conditions', 'Non faisable'].includes(d.faisabilite) && !d.reserves?.trim()) add('reserves', 'Réserves / motif de la conclusion');
  if (d.faisabilite !== 'Non faisable') {
    blocksForType(d.typeProjet).forEach(block => {
      if (d[`na_${block.id}`] === true) return;
      (TECH_REQUIRED[block.id] || []).forEach(key => {
        if (!String(d[key] || '').trim()) add(key, block.fields.find(f => f.key === key)?.label || key);
      });
    });
  }
  if (sigTech.isEmpty()) add('sigTech', 'Signature technicien');
  if (sigClient.isEmpty()) add('sigClient', 'Signature client');
  return problems;
}
function renderReview() {
  const host = document.getElementById('visitReview');
  if (!host || !sigTech || !sigClient) return;
  const d = collectData(), problems = validationProblems();
  host.innerHTML = `<p><strong>${escapeHtml(d.client || 'Client à renseigner')}</strong><br>${escapeHtml(d.typeProjet || 'Projet à sélectionner')}</p>
    <p>${state.existingPhotos.length + state.newPhotos.length} photo(s) · ${state.existingCroquis.length + state.newCroquis.length} croquis</p>` +
    (problems.length ? `<p><strong>${problems.length} point(s) à compléter</strong></p><ul>${problems.map(p => `<li>${escapeHtml(p.label)}</li>`).join('')}</ul>` : '<p>Les informations requises sont complètes. Vous pouvez terminer la visite.</p>');
}
function validateFinal() {
  const problems = validationProblems();
  showBanner(problems.map(p => escapeHtml(p.label)));
  renderReview();
  if (!problems.length) return true;
  const key = problems[0].key;
  const el = document.querySelector(`[data-key="${key}"]`) || document.getElementById(key + 'Area');
  if (el) flashField(el);
  toast('Complétez les points indiqués dans le récapitulatif', 'danger');
  return false;
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
    'Date visite': d.dateVisite || localDate(),
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
      photoLabels: [...state.existingPhotos, ...state.newPhotos].map(p => p.label || ''),
      attachmentLabels: Object.fromEntries([...state.existingPhotos, ...state.newPhotos, ...state.existingCroquis, ...state.newCroquis].filter(p => p.filename).map(p => [p.filename, p.label || ''])),
      croquisLabels: [...state.existingCroquis, ...state.newCroquis].map(c => c.label || ''),
      materiel: state.materiel.filter(m => (m.designation || '').trim()),
      taches: state.taches.filter(t => (t.label || '').trim()),
      splitsInt: state.splitsInt.filter(u => (u.emplacement || u.type || u.frigoM || u.elecM || '').toString().trim()),
      gps: state.gps
    }),
    'Signature technicien': sigTech.isEmpty() ? '' : sigTech.toDataURL(),
    'Signature client': sigClient.isEmpty() ? '' : sigClient.toDataURL()
  };
  if (state.refClient) f['Réf. client (Abonnements)'] = state.refClient;
  f['Client/Prospect'] = state.clientProspectId ? [state.clientProspectId] : [];
  Object.keys(f).forEach(k => { if (f[k] === '') f[k] = null; });
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
  blocksForType(type).forEach(b => { const rows = d[`na_${b.id}`] ? [['Section', 'Non applicable']] : toRows(b.fields); if (rows.length) sections.push({ title: b.title, rows }); });

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
  const date = d.dateVisite || localDate();
  return `visite_${nom}_${date}.pdf`;
}

// ===== Sauvegarde serveur =====
// Une pièce jointe ne bascule en "existante" QUE si son upload Airtable a réussi.
// Les échecs restent dans newPhotos/newCroquis pour permettre un retry — et on
// renvoie le nombre d'échecs au caller pour qu'il décide de poursuivre ou non.
async function ensureAttachments() {
  await attachmentsReady;
  if ([...state.existingPhotos, ...state.existingCroquis].some(p => !p.dataUrl)) {
    await loadExistingAttachments();
  }
  if ([...state.existingPhotos, ...state.existingCroquis].some(p => !p.dataUrl)) {
    throw new Error('Une pièce jointe ne peut pas être chargée. Le PDF ne sera pas généré incomplet. Réessayez dans Photos.');
  }
}
function prepareFilenames() {
  state.newPhotos.forEach(p => { p.filename ||= `photo-${crypto.randomUUID()}.jpg`; });
  state.newCroquis.forEach(p => { p.filename ||= `croquis-${crypto.randomUUID()}.png`; });
}
async function saveRecord() {
  if (loadFailed) throw new Error('Rechargez la visite avec une connexion avant de l’envoyer. Vos modifications restent sur cet appareil.');
  prepareFilenames();
  persist();
  const fields = buildFields('Brouillon');
  let rec;
  if (state.id) ({ visite: rec } = await api.patch(`/visites/${state.id}`, { fields }));
  else {
    ({ visite: rec } = await api.post('/visites', { fields }));
    state.id = rec.id;
    migrateStorageKey();
  }
  // Le nom unique persiste dans le brouillon et permet de reconnaître un envoi
  // réussi même si sa réponse réseau a été perdue.
  let attachFails = 0;
  for (const [pending, existing, field, endpoint, base64Key] of [
    ['newPhotos', 'existingPhotos', 'Photos', '/upload-photo', 'photoBase64'],
    ['newCroquis', 'existingCroquis', 'Croquis', '/upload-croquis', 'croquisBase64']
  ]) {
    for (const item of [...state[pending]]) {
      try {
        const already = (rec.fields?.[field] || []).find(a => a.filename === item.filename);
        if (!already) await api.post(endpoint, { visiteId: state.id, [base64Key]: item.dataUrl.split(',')[1], filename: item.filename });
        const known = state[existing].find(p => p.filename === item.filename);
        if (known) Object.assign(known, item);
        else state[existing].push({ ...item, id: already?.id });
        state[pending].splice(state[pending].indexOf(item), 1);
        persist();
      } catch (e) { attachFails++; console.error('Pièce jointe non envoyée', e); }
    }
  }
  // Récupérer les IDs pour permettre la suppression sans recharger la page.
  const { visite: updated } = await api.get(`/visites/${state.id}`);
  for (const [key, field] of [['existingPhotos', 'Photos'], ['existingCroquis', 'Croquis']]) {
    for (const p of state[key]) p.id ||= (updated.fields?.[field] || []).find(a => a.filename === p.filename)?.id;
  }
  const finalFields = buildFields('Brouillon');
  await api.patch(`/visites/${state.id}`, { fields: finalFields });
  baseAnswers = finalFields['Réponses (JSON)'];
  persist(); renderPhotos(); renderCroquis(); renderReview();
  return { attachFails };
}

// ===== Actions exclusives : le contenu reste stable pendant les envois =====
function busy(btn, label) { btn.disabled = true; btn._old ??= btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${label}`; }
function unbusy(btn) { btn.disabled = false; if (btn._old) { btn.innerHTML = btn._old; delete btn._old; } }
function beginOperation(btn, label) {
  if (pendingMedia) { toast('Les photos sont en cours de préparation. Réessayez dans un instant.'); return false; }
  if (operation) return false;
  clearTimeout(saveTimer);
  persist();
  operation = true;
  document.querySelector('main').inert = true;
  document.getElementById('backBtn').disabled = true;
  busy(btn, label);
  setSaveStatus('Envoi en cours…');
  return true;
}
function endOperation(btn) {
  operation = false;
  document.querySelector('main').inert = false;
  document.getElementById('backBtn').disabled = false;
  unbusy(btn);
  if (dirty) persist();
}
async function onDraft() {
  if (!collectData().client?.trim()) { flashField(document.querySelector('[data-key="client"]')); toast('Nom du client requis', 'danger'); return; }
  const btn = document.getElementById('draftBtn');
  if (!beginOperation(btn, 'Enregistrement…')) return;
  dirty = true;
  try {
    const { attachFails } = await saveRecord();
    if (attachFails) throw new Error(`${attachFails} pièce(s) jointe(s) non envoyée(s). Réessayez avant de quitter.`);
    markSynced(); toast('Brouillon enregistré en ligne', 'success');
  } catch (e) { toast(e.message, 'danger'); }
  finally { endOperation(btn); }
}
async function onPreview() {
  const btn = document.getElementById('previewBtn');
  if (!beginOperation(btn, 'PDF…')) return;
  try {
    await ensureAttachments();
    const doc = await generatePdf(buildPdfPayload());
    doc.save('apercu-' + pdfFilename(collectData()));
    toast('PDF d’aperçu téléchargé', 'success');
  } catch (e) { toast(e.message, 'danger'); }
  finally { endOperation(btn); if (!dirty) setSaveStatus(state.id ? 'Enregistré en ligne' : 'Nouvelle visite'); }
}
async function onFinalize() {
  if (operation || !validateFinal()) return;
  if (!confirm('Terminer la visite et enregistrer son rapport PDF ?')) return;
  const btn = document.getElementById('finalizeBtn');
  if (!beginOperation(btn, 'Enregistrement…')) return;
  dirty = true;
  try {
    const { attachFails } = await saveRecord();
    if (attachFails) throw new Error(`${attachFails} pièce(s) jointe(s) non envoyée(s). La visite reste en brouillon.`);
    await ensureAttachments();
    const progress = label => { busy(btn, label); setSaveStatus(label); };
    const doc = await generatePdf(buildPdfPayload(), { onProgress: progress });
    const fname = pdfFilename(collectData());
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    progress('Envoi du rapport PDF…');
    await api.post('/upload-pdf', { visiteId: state.id, pdfBase64, filename: fname });
    progress('Confirmation de la visite…');
    // Dernière écriture seulement après confirmation de tous les envois.
    await api.patch(`/visites/${state.id}`, { fields: { 'Statut': 'Terminée' } });
    markSynced(); finalized = true;
    try { doc.save(fname); } catch { toast('Rapport enregistré en ligne ; téléchargement indisponible.', 'danger'); }
    toast('Visite terminée et rapport enregistré', 'success');
    setTimeout(() => { location.href = '/dashboard.html'; }, 1400);
  } catch (e) {
    toast('Clôture non confirmée : ' + e.message, 'danger');
    // Ce message reste visible après la disparition du toast.
    btn.dataset.finalizeError = 'Clôture non confirmée : ' + e.message;
  } finally {
    if (!finalized) {
      endOperation(btn);
      if (btn.dataset.finalizeError) {
        setSaveStatus(btn.dataset.finalizeError);
        delete btn.dataset.finalizeError;
      }
    }
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

// Parcours terrain : un seul bloc visible à la fois, sans retirer les champs
// du DOM (les réponses continuent donc à être sauvegardées automatiquement).
function initVisitSteps() {
  const steps = ['projet', 'releve', 'preuves', 'bilan', 'pose'];
  const names = ['Projet', 'Relevé technique', 'Photos & croquis', 'Bilan', 'Préparation de la pose'];
  let current = 0;
  const panels = [...document.querySelectorAll('[data-visit-panel]')];
  const buttons = [...document.querySelectorAll('[data-visit-step]')];
  const prev = document.getElementById('visitPrev');
  const next = document.getElementById('visitNext');
  const label = document.getElementById('visitProgressLabel');
  const render = (index, move = true) => {
    current = Math.max(0, Math.min(steps.length - 1, index));
    const step = steps[current];
    panels.forEach(p => { p.hidden = p.dataset.visitPanel !== step; });
    buttons.forEach((b, i) => {
      const active = i === current;
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    label.textContent = `Étape ${current + 1} sur ${steps.length} · ${names[current]}`;
    prev.disabled = current === 0;
    next.hidden = current === steps.length - 1;
    renderReview();
    next.textContent = current === steps.length - 1 ? '' : `Continuer vers ${names[current + 1].toLowerCase()} →`;
    if (move) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => render(i)));
  prev.addEventListener('click', () => render(current - 1));
  next.addEventListener('click', () => render(current === steps.length - 1 ? 3 : current + 1));
  render(0, false);
}

(async function init() {
  if (!await meReady) { document.querySelector('main').inert = true; return; }

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
  sigTech = initSignaturePad(document.getElementById('sigTech'), document.getElementById('sigTechPh'), scheduleSave);
  sigClient = initSignaturePad(document.getElementById('sigClient'), document.getElementById('sigClientPh'), scheduleSave);

  // Données initiales : Airtable (?id) sinon brouillon local
  let initial = null;
  let colOverride = null;
  const localDraft = readLocalDraft();
  if (!state.id && localDraft?.id) restoreLocal(localDraft);
  let remoteLoaded = false;
  if (state.id) {
    try {
      const { visite } = await api.get(`/visites/${state.id}`);
      const f = visite.fields || {};
      remoteLoaded = true;
      baseAnswers = f['Réponses (JSON)'] || '{}';
      let parsed = {};
      try { parsed = JSON.parse(f['Réponses (JSON)'] || '{}'); } catch {}
      initial = { data: parsed.answers || {}, sigTech: f['Signature technicien'], sigClient: f['Signature client'] };
      // photos existantes (Airtable) : on stocke l'id + filename pour permettre suppression + lazy-load
      (f['Photos'] || []).forEach((att, i) => state.existingPhotos.push({ id: att.id, filename: att.filename, label: parsed.attachmentLabels?.[att.filename] ?? parsed.photoLabels?.[i] ?? '' }));
      // croquis existants
      (f['Croquis'] || []).forEach((att, i) => state.existingCroquis.push({ id: att.id, filename: att.filename, label: parsed.attachmentLabels?.[att.filename] ?? parsed.croquisLabels?.[i] ?? '' }));
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
    } catch (e) {
      if (!localDraft) { toast('Impossible de charger la visite. Réessayez ; aucune donnée ne sera écrasée.', 'danger'); document.querySelector('main').inert = true; return; }
      loadFailed = true;
      toast('Serveur indisponible : reprise du brouillon de cet appareil.', 'danger');
    }
  }
  if (localDraft) {
    const conflict = remoteLoaded && localDraft.baseAnswers && localDraft.baseAnswers !== baseAnswers;
    if (!conflict || confirm('Cette visite a aussi été modifiée en ligne. Reprendre vos modifications locales ? Annuler conserve la version en ligne.')) {
      initial = localDraft; colOverride = null; restoreLocal(localDraft);
      toast('Modifications de cet appareil restaurées. Enregistrez-les en ligne.');
    } else { try { localStorage.removeItem(storageKey); } catch {} }
  }

  // Type d'abord (pour rendre les bonnes sections), puis le reste
  const typeVal = initial?.data?.typeProjet || '';
  document.getElementById('typeProjet').value = typeVal;
  renderTypeSections(typeVal);

  // Technicien par défaut + date du jour
  setVal('technicien', state.userName);
  setVal('dateVisite', localDate());

  // On amorce le buffer answers avec tout ce qui a été saisi auparavant
  // (Airtable ou brouillon local) — y compris des champs pas encore visibles.
  if (initial?.data) {
    state.answers = { ...initial.data };
    applyData(state.answers);
  }
  // Les colonnes Airtable (statut chantier / pose) priment sur le JSON au ré-affichage
  if (colOverride) {
    for (const [k, v] of Object.entries(colOverride)) {
      state.answers[k] = v;
      const el = document.querySelector(`[data-key="${k}"]`);
      if (el) el.value = v;
    }
  }
  if (initial?.sigTech) await sigTech.fromDataURL(initial.sigTech);
  if (initial?.sigClient) await sigClient.fromDataURL(initial.sigClient);
  updateSeg();
  renderPhotos();
  renderCroquis();
  renderMateriel();
  renderTaches();
  renderDimensionnement();
  // Lazy-load des pièces jointes Airtable (proxy serveur → data: URL respectant la CSP)
  attachmentsReady = loadExistingAttachments().catch(e => { toast(e.message, 'danger'); });
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
  ready = true;
  setSaveStatus(dirty ? 'Sur cet appareil · à envoyer' : (state.id ? 'Enregistré en ligne' : 'Nouvelle visite'));
  initVisitSteps();
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
