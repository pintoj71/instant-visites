// Génère icon-192.png et icon-512.png à partir de icon.svg
const SIZES = [192, 512];
const out = document.getElementById('out');

async function svgText() {
  const res = await fetch('/icons/icon.svg');
  return res.text();
}

async function build() {
  const svg = await svgText();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    SIZES.forEach(size => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      c.toBlob(b => {
        const dl = document.createElement('a');
        dl.href = URL.createObjectURL(b);
        dl.download = `icon-${size}.png`;
        dl.className = 'btn';
        dl.textContent = `Télécharger icon-${size}.png`;
        const wrap = document.createElement('div');
        wrap.style.textAlign = 'center';
        c.style.cssText = 'width:120px;height:120px;display:block;border:1px solid #ccc;border-radius:12px;margin-bottom:8px;';
        wrap.appendChild(c);
        wrap.appendChild(dl);
        out.appendChild(wrap);
      }, 'image/png');
    });
  };
  img.src = url;
}
build();
