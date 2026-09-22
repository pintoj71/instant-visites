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
  // Les dates Airtable sont au format YYYY-MM-DD : les parser en UTC
  // fait basculer au jour précédent dans les fuseaux horaires à l’ouest de UTC.
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
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

  // ===== Informations, avec retour à la ligne pour les noms / projets longs =====
  doc.autoTable({
    startY: y,
    body: [
      ['Client', payload.client?.nom || '-', 'Date', fmtFR(payload.dateVisite) || '-'],
      ['Projet', payload.type || '-', 'Technicien', payload.technicien || '-']
    ],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, fillColor: COL.creme, textColor: COL.dark, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 82 }, 2: { cellWidth: 23, fontStyle: 'bold' }, 3: { cellWidth: CW - 123 } },
    margin: { left: M, right: M }
  });
  y = doc.lastAutoTable.finalY + 5;

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

  // ===== Unites interieures (PAC Air/Air) =====
  const splits = (payload.splitsInt || []).filter(u => u && (u.emplacement || u.type || u.frigoM || u.elecM));
  if (splits.length) {
    ensure(16);
    const totalFrigo = splits.reduce((s, u) => s + (parseFloat(u.frigoM) || 0), 0);
    const totalElec = splits.reduce((s, u) => s + (parseFloat(u.elecM) || 0), 0);
    doc.autoTable({
      startY: y,
      head: [['Unite interieure', 'Type', 'Frigo (m)', 'Elec (m)', 'Puissance']],
      body: splits.map((u, i) => [
        `${i + 1}. ${u.emplacement || '-'}`,
        u.type || '',
        u.frigoM || '',
        u.elecM || '',
        u.puissance || ''
      ]).concat(totalFrigo || totalElec ? [['TOTAL', '', totalFrigo ? totalFrigo.toFixed(1) : '', totalElec ? totalElec.toFixed(1) : '', '']] : []),
      theme: 'grid',
      headStyles: { fillColor: COL.bordeaux, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: COL.dark, cellPadding: 1.6 },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      columnStyles: { 0: { cellWidth: CW - 30 - 25 - 25 - 30, fontStyle: 'bold', textColor: COL.marron }, 1: { cellWidth: 30 }, 2: { cellWidth: 25, halign: 'center' }, 3: { cellWidth: 25, halign: 'center' }, 4: { cellWidth: 30, halign: 'center' } },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 4;
  }

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

  // ===== Dimensionnement (indicatif) — affiché uniquement si status === 'ok' =====
  const dim = payload.dimensionnement || null;
  if (dim && dim.status === 'ok' && dim.lines && dim.lines.length) {
    ensure(18);
    y += 2;
    doc.setFillColor(...COL.bordeaux);
    doc.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(10.5);
    doc.text('DIMENSIONNEMENT (INDICATIF)', M + 4, y + 5.5);
    y += 12;
    doc.autoTable({
      startY: y,
      body: dim.lines.map(d => [d.label, d.value]),
      theme: 'grid',
      bodyStyles: { fontSize: 9, textColor: COL.dark, cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      columnStyles: {
        0: { cellWidth: CW * 0.55, fontStyle: 'bold', textColor: COL.marron },
        1: { cellWidth: CW * 0.45 }
      },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 4;
    // Tableau detail par piece (PAC Air/Air)
    if (dim.perRoom && dim.perRoom.length) {
      ensure(20);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COL.marron);
      doc.text('Detail par piece', M, y); y += 4;
      doc.autoTable({
        startY: y,
        head: [['Piece', 'Surface', 'Puissance', "Type d'unite"]],
        body: dim.perRoom.map(r => [r.emplacement, r.surface + ' m2', r.puissance + ' kW', r.type || '-']),
        theme: 'grid',
        headStyles: { fillColor: COL.marron, textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9, textColor: COL.dark, cellPadding: 1.6 },
        alternateRowStyles: { fillColor: [250, 246, 240] },
        margin: { left: M, right: M }
      });
      y = doc.lastAutoTable.finalY + 4;
    }
  }

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

  // ===== Croquis & schemas =====
  const croquis = (payload.croquis || []).filter(c => c.dataUrl);
  if (croquis.length) {
    ensure(12);
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...COL.marron);
    doc.text('Croquis & schemas', M, y); y += 5;
    const perRow = 2, gap = 4;
    const cellW = (CW - gap * (perRow - 1)) / perRow;
    const cellH = cellW * 0.75;
    for (let i = 0; i < croquis.length; i++) {
      const col = i % perRow;
      if (col === 0) ensure(cellH + 8);
      const x = M + col * (cellW + gap);
      const cy = y;
      doc.setDrawColor(...COL.creme); doc.setFillColor(255, 255, 255);
      doc.rect(x, cy, cellW, cellH, 'S');
      const sz = await imgSize(croquis[i].dataUrl);
      if (sz) {
        const r = Math.min((cellW - 2) / sz.w, (cellH - 2) / sz.h);
        const dw = sz.w * r, dh = sz.h * r;
        const dx = x + (cellW - dw) / 2, dy = cy + (cellH - dh) / 2;
        try { doc.addImage(croquis[i].dataUrl, 'PNG', dx, dy, dw, dh); } catch {}
        doc.setDrawColor(...COL.grey); doc.rect(dx, dy, dw, dh, 'S');
      }
      const lab = croquis[i].label || '';
      if (lab) { doc.setFontSize(7.5).setTextColor(...COL.dark); const lw = doc.splitTextToSize(lab, cellW); doc.text(lw[0], x + 1, cy + cellH + 3.5); }
      if (col === perRow - 1 || i === croquis.length - 1) y = cy + cellH + 7;
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
