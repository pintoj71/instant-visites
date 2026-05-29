// Éditeur de croquis : canevas tactile + stylo (3 tailles, 4 couleurs) + gomme
// + photo en fond + effacer + sauvegarder/annuler. Renvoie un dataURL PNG.

const COLORS = ['#2a211b', '#c0392b', '#1f4f80', '#2f5320'];
const SIZES = [2, 4, 7];

export function openCroquisEditor({ initialDataUrl, onSave, onCancel } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'croquis-overlay';
  overlay.innerHTML = `
    <div class="croquis-editor">
      <div class="croquis-toolbar">
        <div class="tools-group">
          ${COLORS.map((c, i) => `<button type="button" class="ctool color${i === 0 ? ' sel' : ''}" data-color="${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')}
        </div>
        <div class="tools-group">
          ${SIZES.map((s, i) => `<button type="button" class="ctool size${i === 1 ? ' sel' : ''}" data-size="${s}" aria-label="Épaisseur ${s}"><span style="width:${s * 2}px;height:${s * 2}px;background:currentColor;border-radius:50%;display:inline-block;"></span></button>`).join('')}
        </div>
        <div class="tools-group">
          <button type="button" class="ctool sel" id="croquisPen" aria-label="Crayon">✏️</button>
          <button type="button" class="ctool" id="croquisEraser" aria-label="Gomme">🩹</button>
          <button type="button" class="ctool" id="croquisBgPhoto" aria-label="Photo en fond">🖼️</button>
          <input type="file" id="croquisBgInput" accept="image/*" hidden>
          <button type="button" class="ctool danger" id="croquisClear" aria-label="Effacer">🗑️</button>
        </div>
        <div class="tools-group right">
          <button type="button" class="btn ghost small" id="croquisCancel">Annuler</button>
          <button type="button" class="btn dark small" id="croquisSave">Enregistrer</button>
        </div>
      </div>
      <div class="croquis-canvas-wrap">
        <canvas id="croquisCanvas"></canvas>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.documentElement.classList.add('no-scroll');

  const canvas = overlay.querySelector('#croquisCanvas');
  const ctx = canvas.getContext('2d');
  let color = COLORS[0];
  let size = SIZES[1];
  let tool = 'pen';
  let drawing = false;
  let pendingInitial = initialDataUrl || null;

  function close() {
    window.removeEventListener('resize', fit);
    document.documentElement.classList.remove('no-scroll');
    overlay.remove();
  }

  function paintWhite(w, h) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }

  function fit() {
    const wrap = overlay.querySelector('.croquis-canvas-wrap');
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(50, Math.floor(r.width));
    const h = Math.max(50, Math.floor(r.height));
    // Sauvegarde du dessin existant pour le redessiner après resize
    const prev = (canvas.width && canvas.height) ? canvas.toDataURL() : null;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintWhite(w, h);
    const src = prev || pendingInitial;
    if (src) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = src;
      pendingInitial = null;
    }
  }

  // Laisse le navigateur calculer la mise en page avant le premier fit.
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const ev = e.touches ? e.touches[0] : e;
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function applyStroke() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = size * 3;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
    }
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    const p = pos(e);
    applyStroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  function selectIn(group, el) {
    overlay.querySelectorAll(group).forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
  }

  overlay.querySelectorAll('.color').forEach(b => b.addEventListener('click', () => {
    color = b.dataset.color;
    tool = 'pen';
    selectIn('.color', b);
    overlay.querySelector('#croquisPen').classList.add('sel');
    overlay.querySelector('#croquisEraser').classList.remove('sel');
  }));
  overlay.querySelectorAll('.size').forEach(b => b.addEventListener('click', () => {
    size = parseInt(b.dataset.size, 10);
    selectIn('.size', b);
  }));
  overlay.querySelector('#croquisPen').addEventListener('click', () => {
    tool = 'pen';
    overlay.querySelector('#croquisPen').classList.add('sel');
    overlay.querySelector('#croquisEraser').classList.remove('sel');
  });
  overlay.querySelector('#croquisEraser').addEventListener('click', () => {
    tool = 'eraser';
    overlay.querySelector('#croquisEraser').classList.add('sel');
    overlay.querySelector('#croquisPen').classList.remove('sel');
  });
  overlay.querySelector('#croquisBgPhoto').addEventListener('click', () => overlay.querySelector('#croquisBgInput').click());
  overlay.querySelector('#croquisBgInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Charger une photo en fond remplace le croquis actuel. Continuer ?')) { e.target.value = ''; return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        paintWhite(w, h);
        const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * k;
        const dh = img.naturalHeight * k;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
  overlay.querySelector('#croquisClear').addEventListener('click', () => {
    if (!confirm('Effacer tout le croquis ?')) return;
    const dpr = window.devicePixelRatio || 1;
    paintWhite(canvas.width / dpr, canvas.height / dpr);
  });

  overlay.querySelector('#croquisSave').addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/png');
    close();
    if (onSave) onSave(dataUrl);
  });
  overlay.querySelector('#croquisCancel').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });
}
