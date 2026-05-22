// Génération du rapport de visite technique (jsPDF + autoTable, via CDN).
// ATTENTION : police standard jsPDF = WinAnsi/Latin-1. Ne pas utiliser de glyphes
// hors Latin-1 (pas de <=, >=, indices, symboles spéciaux). Les accents FR passent.
import { LOGO_PNG, LOGO_W, LOGO_H } from '/js/logo.js';

let jsPDFLib = null;
async function loadJsPDF() {
  if (jsPDFLib) return jsPDFLib;
  const add = (src) => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  await add('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
  await add('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js');
  jsPDFLib = window.jspdf.jsPDF;
  return jsPDFLib;
}

const COL = {
  marron: [61, 36, 24],
  bordeaux: [122, 47, 42],
  terracotta: [194, 98, 46],
  creme: [243, 236, 225],
  dark: [42, 33, 27],
  ok: [79, 122, 58],
  warn: [185, 130, 20],
  danger: [176, 50, 40],
  grey: [120, 110, 100]
};

const fmtFR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR');
};

function imgSize(dataUrl) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 });
    i.onerror = () => res(null);
    i.src = dataUrl;
  });
}

export async function generatePdf(payload) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 12, CW = PW - M * 2;
  let y = 0;

  const ensure = (h) => { if (y + h > PH - 14) { doc.addPage(); y = 14; } };

  // ===== En-tête =====
  doc.setFillColor(...COL.marron);
  doc.rect(0, 0, PW, 26, 'F');
  doc.setFillColor(...COL.terracotta);
  doc.rect(0, 26, PW, 1.6, 'F');
  // Logo (ratio natif, dans une boîte 46x18)
  try {
    const boxW = 46, boxH = 18, r = Math.min(boxW / LOGO_W, boxH / LOGO_H);
    doc.addImage(LOGO_PNG, 'PNG', M, 4, LOGO_W * r, LOGO_H * r);
  } catch {}
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.text('RAPPORT DE VISITE TECHNIQUE', PW - M, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text('Etude de faisabilite avant installation', PW - M, 20, { align: 'right' });
  y = 34;

  // ===== Bandeau infos =====
  doc.setDrawColor(...COL.creme); doc.setFillColor(...COL.creme);
  doc.roundedRect(M, y, CW, 18, 2, 2, 'F');
  doc.setTextColor(...COL.dark).setFontSize(10);
  const col2 = M + CW / 2;
  doc.setFont('helvetica', 'bold');
  doc.text(`Client : `, M + 4, y + 6);
  doc.text(`Type de projet : `, M + 4, y + 12);
  doc.text(`Date : `, col2 + 2, y + 6);
  doc.text(`Technicien : `, col2 + 2, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(String(payload.client?.nom || '-'), M + 4 + doc.getTextWidth('Client : '), y + 6);
  doc.text(String(payload.type || '-'), M + 4 + doc.getTextWidth('Type de projet : '), y + 12);
  doc.text(fmtFR(payload.dateVisite) || '-', col2 + 2 + doc.getTextWidth('Date : '), y + 6);
  doc.text(String(payload.technicien || '-'), col2 + 2 + doc.getTextWidth('Technicien : '), y + 12);
  y += 18 + 5;

  // Coordonnées client (si présentes)
  const coords = [payload.client?.tel, payload.client?.email, (payload.client?.adresse || '').replace(/\n/g, ', ')].filter(Boolean).join('  |  ');
  if (coords) {
    doc.setFontSize(8.5).setTextColor(...COL.grey);
    const w = doc.splitTextToSize(coords, CW);
    doc.text(w, M, y); y += w.length * 4 + 2;
  }

  // ===== Sections (tables) =====
  const sectionTable = (title, rows) => {
    ensure(16);
    doc.autoTable({
      startY: y,
      head: [[title, '']],
      body: rows.map(([k, v]) => [k, String(v)]),
      theme: 'grid',
      headStyles: { fillColor: COL.bordeaux, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: COL.dark, cellPadding: 1.6 },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold', textColor: COL.marron }, 1: { cellWidth: CW - 70 } },
      margin: { left: M, right: M },
      didDrawPage: () => {}
    });
    y = doc.lastAutoTable.finalY + 4;
  };

  (payload.sections || []).forEach(s => { if (s.rows && s.rows.length) sectionTable(s.title, s.rows); });

  // ===== Conclusion de faisabilité =====
  ensure(30);
  const fz = payload.faisabilite || 'Non renseignée';
  let band = COL.grey;
  if (fz === 'Faisable') band = COL.ok;
  else if (fz === 'Faisable sous conditions') band = COL.warn;
  else if (fz === 'Non faisable') band = COL.danger;
  doc.setFillColor(...band);
  doc.roundedRect(M, y, CW, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(12);
  doc.text(`FAISABILITE : ${fz.toUpperCase()}`, M + 5, y + 8);
  y += 16;

  doc.setTextColor(...COL.dark).setFont('helvetica', 'normal').setFontSize(9.5);
  if (payload.estimation || payload.delai) {
    doc.setFont('helvetica', 'bold');
    if (payload.estimation) { doc.text(`Estimation indicative : `, M, y); doc.setFont('helvetica', 'normal'); doc.text(String(payload.estimation), M + doc.getTextWidth('Estimation indicative : '), y); }
    doc.setFont('helvetica', 'bold');
    if (payload.delai) { const lx = M + (payload.estimation ? CW * 0.55 : 0); doc.text(`Delai : `, lx, y); doc.setFont('helvetica', 'normal'); doc.text(String(payload.delai), lx + doc.getTextWidth('Delai : '), y); }
    y += 6;
  }
  const textBlock = (title, txt) => {
    if (!txt) return;
    ensure(12);
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...COL.bordeaux);
    doc.text(title, M, y); y += 4.5;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COL.dark);
    const w = doc.splitTextToSize(String(txt), CW);
    w.forEach(line => { ensure(5); doc.text(line, M, y); y += 4.4; });
    y += 2;
  };
  textBlock('Reserves / travaux prealables', payload.reserves);
  textBlock('Recommandations', payload.recommandations);
  if (payload.gps) { doc.setFontSize(8).setTextColor(...COL.grey); doc.text(`Position GPS : ${payload.gps.lat.toFixed(5)}, ${payload.gps.lng.toFixed(5)}`, M, y); y += 5; }

  // ===== Preparation du chantier (fil conducteur) =====
  const ch = payload.chantier || {};
  const chMeta = [
    ch.statut && `Statut chantier : ${ch.statut}`,
    ch.datePose && `Pose prevue : ${fmtFR(ch.datePose)}`,
    ch.equipe && `Equipe : ${ch.equipe}`,
    ch.duree && `Duree estimee : ${ch.duree}`
  ].filter(Boolean);
  const chMateriel = (ch.materiel || []).filter(m => (m.designation || '').trim());
  const chTaches = (ch.taches || []).filter(t => (t.label || '').trim());
  if (chMeta.length || chMateriel.length || chTaches.length) {
    ensure(18);
    y += 2;
    doc.setFillColor(...COL.marron);
    doc.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(10.5);
    doc.text('PREPARATION DU CHANTIER A VENIR', M + 4, y + 5.5);
    y += 12;
    if (chMeta.length) {
      doc.setTextColor(...COL.dark).setFont('helvetica', 'normal').setFontSize(9);
      const w = doc.splitTextToSize(chMeta.join('   |   '), CW);
      w.forEach(line => { ensure(5); doc.text(line, M, y); y += 4.6; });
      y += 1;
    }
    if (chMateriel.length) {
      ensure(14);
      doc.autoTable({
        startY: y,
        head: [['Materiel a prevoir / commander', 'Qte', 'Note']],
        body: chMateriel.map(m => [String(m.designation), String(m.quantite || ''), String(m.note || '')]),
        theme: 'grid',
        headStyles: { fillColor: COL.bordeaux, textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: COL.dark, cellPadding: 1.6 },
        alternateRowStyles: { fillColor: [250, 246, 240] },
        columnStyles: { 0: { cellWidth: CW - 68, fontStyle: 'bold', textColor: COL.marron }, 1: { cellWidth: 16, halign: 'center' }, 2: { cellWidth: 52 } },
        margin: { left: M, right: M }
      });
      y = doc.lastAutoTable.finalY + 4;
    }
    if (chTaches.length) {
      ensure(10);
      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...COL.bordeaux);
      doc.text('Travaux prealables a lever avant la pose', M, y); y += 5;
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COL.dark);
      chTaches.forEach(t => {
        const mark = t.done ? '[X] ' : '[  ] ';
        const w = doc.splitTextToSize(mark + String(t.label), CW - 2);
        w.forEach((line, idx) => { ensure(5); doc.text(line, M + (idx ? 6 : 0), y); y += 4.6; });
      });
      y += 2;
    }
  }

  // ===== Photos =====
  const photos = (payload.photos || []).filter(p => p.dataUrl);
  if (photos.length) {
    ensure(12);
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...COL.marron);
    doc.text('Photos du lieu', M, y); y += 5;
    const perRow = 3, gap = 4;
    const cellW = (CW - gap * (perRow - 1)) / perRow;
    const cellH = cellW * 0.78;
    for (let i = 0; i < photos.length; i++) {
      const col = i % perRow;
      if (col === 0) ensure(cellH + 8);
      const x = M + col * (cellW + gap);
      const cy = y;
      // Cadre léger
      doc.setDrawColor(...COL.creme); doc.setFillColor(255, 255, 255);
      doc.rect(x, cy, cellW, cellH, 'S');
      const sz = await imgSize(photos[i].dataUrl);
      if (sz) {
        const r = Math.min((cellW - 2) / sz.w, (cellH - 2) / sz.h);
        const dw = sz.w * r, dh = sz.h * r;
        const dx = x + (cellW - dw) / 2, dy = cy + (cellH - dh) / 2;
        try { doc.addImage(photos[i].dataUrl, 'JPEG', dx, dy, dw, dh); } catch {}
        doc.setDrawColor(...COL.grey); doc.rect(dx, dy, dw, dh, 'S'); // encadre la photo réelle
      }
      const lab = photos[i].label || '';
      if (lab) { doc.setFontSize(7.5).setTextColor(...COL.dark); const lw = doc.splitTextToSize(lab, cellW); doc.text(lw[0], x + 1, cy + cellH + 3.5); }
      if (col === perRow - 1 || i === photos.length - 1) y = cy + cellH + 7;
    }
  }

  // ===== Signatures =====
  ensure(46);
  y += 2;
  doc.setFillColor(...COL.creme);
  doc.rect(M, y, CW / 2 - 2, 6, 'F'); doc.rect(M + CW / 2 + 2, y, CW / 2 - 2, 6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COL.marron);
  doc.text('Technicien', M + 3, y + 4.2);
  doc.text('Client', M + CW / 2 + 5, y + 4.2);
  y += 8;
  const sigH = 28, sigW = CW / 2 - 2;
  const drawSig = (img, x) => {
    doc.setDrawColor(...COL.grey); doc.rect(x, y, sigW, sigH, 'S');
    if (img) {
      try {
        // signature PNG ~ ratio large ; on l'ajuste dans la boîte
        doc.addImage(img, 'PNG', x + 2, y + 2, sigW - 4, sigH - 4);
      } catch {}
    }
  };
  drawSig(payload.sigTech, M);
  drawSig(payload.sigClient, M + CW / 2 + 2);
  y += sigH + 4;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COL.dark);
  doc.text(`${payload.technicien || ''}`, M + 3, y);
  doc.text(`Fait le ${new Date().toLocaleString('fr-FR')}`, M + CW / 2 + 5, y);

  // ===== Pieds de page =====
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COL.creme); doc.line(M, PH - 12, PW - M, PH - 12);
    doc.setFontSize(7.5).setTextColor(...COL.grey).setFont('helvetica', 'normal');
    doc.text('INSTANT BY PINTO - Rapport de visite technique (document indicatif, sans valeur contractuelle)', M, PH - 8);
    doc.text(`Page ${p}/${n}`, PW - M, PH - 8, { align: 'right' });
  }

  return doc;
}
