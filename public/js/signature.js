// Pad de signature tactile minimaliste
export function initSignaturePad(canvas, placeholder) {
  const ctx = canvas.getContext('2d');
  let drawing = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const data = canvas.width ? canvas.toDataURL() : null;
    canvas.width = r.width * ratio;
    canvas.height = r.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a211b';
    if (data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
      img.src = data;
    }
  }
  resize();
  window.addEventListener('resize', resize);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const ev = e.touches ? e.touches[0] : e;
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function start(e) { e.preventDefault(); drawing = true; if (placeholder) placeholder.style.display = 'none'; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (placeholder) placeholder.style.display = 'block';
    },
    isEmpty() {
      const blank = document.createElement('canvas');
      blank.width = canvas.width;
      blank.height = canvas.height;
      return canvas.toDataURL() === blank.toDataURL();
    },
    toDataURL() { return canvas.toDataURL('image/png'); },
    fromDataURL(url) {
      const img = new Image();
      img.onload = () => {
        const ratio = window.devicePixelRatio || 1;
        ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio);
        if (placeholder) placeholder.style.display = 'none';
      };
      img.src = url;
    }
  };
}
