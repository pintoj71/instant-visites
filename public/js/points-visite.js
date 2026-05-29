// ============================================================================
// Définition centralisée des sections / champs de la visite technique.
// Pour ajouter un type d'installation : ajouter un bloc dans TYPE_BLOCKS et
// le référencer dans SECTIONS_BY_TYPE. Rien d'autre à toucher.
//
// Schéma d'un champ :
//   { key, label, type, options?, placeholder?, hint?, voice?, full?, step?, inputMode? }
//   type ∈ text | tel | email | number | date | textarea | select | segmented | unit-list
//   - `segmented`  : groupe de boutons radio (1 tap, idéal pour Oui/Non/À vérifier)
//   - `unit-list`  : liste répétable d'unités (PAC Air/Air : 1 ligne par split)
//   - `inputMode`  : 'numeric' | 'decimal' → bon clavier mobile sur les champs texte
// Les `key` doivent rester STABLES (servent de clé de stockage JSON).
// ============================================================================

const ON = ['Oui', 'Non'];
const ON_AV = ['Oui', 'Non', 'À vérifier'];

// ---- Types d'unités intérieures pour PAC Air/Air (segmented par split) ----
export const SPLIT_TYPES = ['Mural', 'Cassette', 'Console', 'Gainable'];

// ---- Liste exhaustive des types de projet (= options Airtable "Type de projet") ----
export const TYPES_PROJET = [
  'Poêle ou insert bois',
  'Poêle ou insert granulés',
  'Chaudière bois',
  'Chaudière granulés',
  'Chaudière gaz',
  'PAC Air/Eau',
  'PAC Eau/Eau',
  'PAC Air/Air',
  'Chauffe-eau thermodynamique'
];

// ---- Sections communes à TOUTE visite (rendues une fois, indépendantes du type) ----
export const COMMON_SECTIONS = [
  {
    id: 'client', title: 'Client & lieu', icon: '👤', open: true,
    fields: [
      { key: 'client', label: 'Nom du client', type: 'text', full: true },
      { key: 'telephone', label: 'Téléphone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'adresse', label: 'Adresse', type: 'textarea', full: true },
      { key: 'typeLogement', label: 'Type de logement', type: 'segmented', options: ['Maison', 'Appartement'], info: 'Conditionne l\'accessibilité, le bruit pour les voisins (PAC), la possibilité de tubage extérieur et l\'autorisation copro éventuelle.' },
      { key: 'anneeConstruction', label: 'Année de construction', type: 'text', inputMode: 'numeric', info: 'Année de construction du bâti principal. Utile pour deviner l\'isolation et la nature des murs (pierre, parpaing, ossature bois…).' },
      { key: 'surface', label: 'Surface à chauffer (m2)', type: 'number', info: 'Surface habitable totale chauffée en m². Compter uniquement les pièces principales (séjour, chambres, bureau). N\'inclut pas garage, cellier non chauffé, balcons, combles non aménagés.' },
      { key: 'nbPieces', label: 'Nombre de pièces', type: 'number', info: 'Nombre total de pièces principales (séjour + chambres). Ne compte pas SDB, WC, couloirs, dressing, cuisine ouverte sur séjour. Sert à estimer le nb de personnes et donc le volume ECS.' },
      { key: 'hauteurPlafond', label: 'Hauteur sous plafond (m)', type: 'number', step: '0.1', info: 'Hauteur sous plafond moyenne en mètres. Mesurer dans la pièce de vie. Au-delà de 2,5 m, le volume à chauffer (et la puissance nécessaire) augmente sensiblement.' },
      { key: 'isolation', label: "Niveau d'isolation", type: 'segmented', options: ['Faible', 'Moyen', 'Bon', 'RT2012+'], info: 'Niveau d\'isolation thermique global du logement. Faible = avant 1974, simple vitrage. Moyen = 1974-2005, double vitrage récent. Bon = 2006-2012, RT2005. RT2012+ = après 2013, BBC/RT2012/RE2020. Détermine le coefficient W/m³ du calcul de puissance.' }
    ]
  },
  {
    id: 'acces', title: 'Accès chantier', icon: '🚚', open: true,
    fields: [
      { key: 'etage', label: 'Étage', type: 'text', inputMode: 'numeric' },
      { key: 'ascenseur', label: 'Ascenseur', type: 'segmented', options: ON },
      { key: 'stationnement', label: 'Stationnement', type: 'segmented', options: ['Aisé', 'Limité', 'Difficile'] },
      { key: 'largeurAcces', label: 'Largeur portes / couloirs (cm)', type: 'text', inputMode: 'numeric' },
      { key: 'distancePortage', label: 'Distance de portage (m)', type: 'text', inputMode: 'decimal' },
      { key: 'copropriete', label: 'Copropriété', type: 'segmented', options: ON },
      { key: 'zoneABF', label: 'Zone classée / ABF', type: 'segmented', options: ON_AV },
      { key: 'accesNotes', label: "Contraintes d'accès / livraison", type: 'textarea', voice: true, full: true }
    ]
  },
  {
    id: 'electricite', title: 'Électricité', icon: '⚡', open: true,
    fields: [
      { key: 'typeCompteur', label: 'Type de compteur', type: 'segmented', options: ['Monophasé', 'Triphasé', 'Inconnu'] },
      { key: 'puissanceSouscrite', label: 'Puissance souscrite (kVA)', type: 'text', inputMode: 'decimal' },
      { key: 'disjoncteurDedie', label: 'Disjoncteur dédié disponible', type: 'segmented', options: ON_AV },
      { key: 'tableauProximite', label: 'Tableau à proximité', type: 'segmented', options: ON },
      { key: 'sectionCable', label: 'Section de câble (mm2)', type: 'text', inputMode: 'decimal' },
      { key: 'miseTerre', label: 'Mise à la terre', type: 'segmented', options: ON_AV },
      { key: 'elecNotes', label: 'Observations électriques', type: 'textarea', voice: true, full: true }
    ]
  }
];

// ---- Blocs conditionnels par famille ----
export const TYPE_BLOCKS = {
  bois: {
    id: 'bois', title: 'Conduit & sécurité (bois / granulés)', icon: '🔥',
    fields: [
      { key: 'conduitExistant', label: 'Conduit existant', type: 'segmented', options: ON },
      { key: 'conduitType', label: 'Type de conduit', type: 'select', options: ['Maçonné / boisseau', 'Métallique isolé', 'Inox tubé', 'Autre'] },
      { key: 'conduitMateriau', label: 'Matériau', type: 'text' },
      { key: 'conduitDiametre', label: 'Diamètre (mm)', type: 'text', inputMode: 'numeric' },
      { key: 'conduitHauteur', label: 'Hauteur (m)', type: 'text', inputMode: 'decimal' },
      { key: 'devoiement', label: 'Dévoiement', type: 'segmented', options: ['Aucun', '1 dévoiement', '2 dévoiements'] },
      { key: 'etatConduit', label: 'État du conduit', type: 'segmented', options: ['Bon', 'Moyen', 'Mauvais'] },
      { key: 'tubageNecessaire', label: 'Tubage nécessaire', type: 'segmented', options: ON_AV },
      { key: 'protectionSol', label: 'Protection du sol', type: 'segmented', options: ['Existante', 'À prévoir', 'Sans objet'] },
      { key: 'ameneeAir', label: "Arrivée d'air comburant", type: 'segmented', options: ['Directe', 'Indirecte', 'À créer'] },
      { key: 'distancesSecurite', label: 'Distances de sécurité aux matériaux combustibles', type: 'textarea', voice: true, full: true },
      { key: 'emplacementBois', label: "Emplacement pressenti de l'appareil", type: 'textarea', voice: true, full: true }
    ]
  },
  granules: {
    id: 'granules', title: 'Combustible & stockage (granulés)', icon: '🟤',
    fields: [
      { key: 'combustible', label: 'Type de combustible', type: 'select', options: ['Granulés sac', 'Granulés vrac', 'Bûches', 'Mixte'] },
      { key: 'stockageType', label: 'Stockage', type: 'select', options: ['Réservoir intégré', 'Silo textile', 'Silo maçonné', 'Local dédié'] },
      { key: 'stockageVolume', label: 'Volume / capacité de stockage', type: 'text' },
      { key: 'stockageEmplacement', label: "Emplacement du stockage / distance d'alimentation", type: 'textarea', voice: true, full: true }
    ]
  },
  hydraulique: {
    id: 'hydraulique', title: 'Circuit hydraulique', icon: '💧',
    fields: [
      { key: 'emetteurs', label: 'Émetteurs existants', type: 'select', options: ['Radiateurs', 'Plancher chauffant', 'Ventilo-convecteurs', 'Mixte', 'Aucun'] },
      { key: 'tempDepart', label: "Température de départ d'eau (degres C)", type: 'text', inputMode: 'numeric' },
      { key: 'circuit', label: 'État du circuit hydraulique', type: 'segmented', options: ['Bon état', 'À adapter', 'À refaire'] },
      { key: 'ballonECS', label: 'Ballon ECS', type: 'segmented', options: ['Oui intégré', 'Oui séparé', 'Non'] },
      { key: 'volumeECS', label: 'Volume ECS (L)', type: 'text', inputMode: 'numeric' },
      { key: 'hydroNotes', label: 'Observations circuit / raccordement', type: 'textarea', voice: true, full: true }
    ]
  },
  gaz: {
    id: 'gaz', title: 'Alimentation & évacuation gaz', icon: '🔵',
    fields: [
      { key: 'alimGaz', label: 'Alimentation gaz existante', type: 'segmented', options: ['Gaz de ville', 'Citerne propane', 'À créer'] },
      { key: 'typeEvac', label: "Type d'évacuation", type: 'select', options: ['Ventouse (type C)', 'Cheminée (type B)', 'VMC gaz'] },
      { key: 'conduitGaz', label: 'Conduit / débouché', type: 'text' },
      { key: 'emplacementChaufferie', label: 'Emplacement chaufferie', type: 'textarea', voice: true, full: true }
    ]
  },
  unite_ext_air: {
    id: 'unite_ext_air', title: 'Unité extérieure & liaisons', icon: '🌀',
    fields: [
      { key: 'distanceVoisinage', label: 'Distance au voisinage (m) — bruit', type: 'text', inputMode: 'decimal' },
      { key: 'liaisonFrigo', label: 'Longueur liaison frigorifique TOTALE (m)', type: 'text', inputMode: 'decimal', hint: 'Pour multi-split, voir le détail par unité ci-dessous' },
      { key: 'evacCondensats', label: 'Évacuation des condensats', type: 'segmented', options: ['Vers évacuation', 'Pompe de relevage', 'À créer'] },
      { key: 'alimElecUnite', label: 'Alimentation électrique unité', type: 'segmented', options: ['Existante', 'À créer'] },
      { key: 'empUniteExt', label: 'Emplacement unité extérieure', type: 'textarea', voice: true, full: true }
    ]
  },
  captage: {
    id: 'captage', title: 'Captage (Eau/Eau)', icon: '🌍',
    fields: [
      { key: 'typeCaptage', label: 'Type de captage', type: 'select', options: ['Horizontal', 'Sondes verticales', 'Sur nappe'] },
      { key: 'surfaceTerrain', label: 'Surface terrain disponible (m2)', type: 'text', inputMode: 'decimal' },
      { key: 'profondeur', label: 'Profondeur sondes / forage (m)', type: 'text', inputMode: 'decimal' },
      { key: 'captageNotes', label: 'Contraintes captage / autorisations', type: 'textarea', voice: true, full: true }
    ]
  },
  splits: {
    id: 'splits', title: 'Unités intérieures (Air/Air)', icon: '❄️',
    fields: [
      { key: 'configSplit', label: 'Configuration', type: 'segmented', options: ['Monosplit', 'Multisplit', 'Gainable'] },
      { key: 'splitsInt', label: 'Détail par unité intérieure (1 ligne = 1 split)', type: 'unit-list', full: true }
    ]
  },
  cet: {
    id: 'cet', title: 'Chauffe-eau thermodynamique', icon: '🚿',
    fields: [
      { key: 'volumeBallon', label: 'Volume du ballon', type: 'segmented', options: ['200 L', '270 L', '300 L', 'Autre'] },
      { key: 'sourceAir', label: "Source d'air", type: 'select', options: ['Air ambiant', 'Air extérieur gainé', 'Air extrait'] },
      { key: 'volumeLocal', label: 'Volume du local (m3) — min 20 m3 si air ambiant', type: 'text', inputMode: 'decimal' },
      { key: 'evacCondensatsCet', label: 'Évacuation des condensats', type: 'segmented', options: ['Vers évacuation', 'Pompe de relevage', 'À créer'] },
      { key: 'empCet', label: 'Emplacement', type: 'textarea', voice: true, full: true }
    ]
  }
};

// ---- Correspondance Type de projet -> blocs conditionnels ----
export const SECTIONS_BY_TYPE = {
  'Poêle ou insert bois': ['bois'],
  'Poêle ou insert granulés': ['bois', 'granules'],
  'Chaudière bois': ['bois', 'hydraulique'],
  'Chaudière granulés': ['bois', 'granules', 'hydraulique'],
  'Chaudière gaz': ['gaz', 'hydraulique'],
  'PAC Air/Eau': ['unite_ext_air', 'hydraulique'],
  'PAC Eau/Eau': ['captage', 'hydraulique'],
  'PAC Air/Air': ['unite_ext_air', 'splits'],
  'Chauffe-eau thermodynamique': ['cet']
};

// Renvoie la liste des blocs (objets) pour un type donné
export function blocksForType(type) {
  return (SECTIONS_BY_TYPE[type] || []).map(id => TYPE_BLOCKS[id]).filter(Boolean);
}

// ============================================================================
// FIL CONDUCTEUR DU CHANTIER À VENIR
// La visite ne s'arrête plus au constat : elle prépare et suit la pose.
// ============================================================================

// ---- Pipeline de suivi du chantier (= options Airtable "Statut chantier") ----
export const CHANTIER_STATUTS = ['À planifier', 'Devis', 'Planifié', 'Posé', 'SAV', 'Annulé'];

// ---- Matériel type suggéré par projet : base de départ ÉDITABLE (le tech ajuste) ----
export const MATERIEL_SUGGESTIONS = {
  'Poêle ou insert bois': ['Appareil (poêle / insert) bois', 'Tubage / conduit inox', 'Plaque de sol / protection', "Kit arrivée d'air comburant", 'Sortie de toit / chapeau'],
  'Poêle ou insert granulés': ['Appareil granulés', 'Tubage / conduit inox Ø80-100', 'Kit ventouse (si étanche)', 'Plaque de sol / protection', 'Câble alimentation dédié'],
  'Chaudière bois': ['Chaudière bois', 'Ballon tampon', 'Tubage / conduit', "Vase d'expansion", 'Circulateur + régulation'],
  'Chaudière granulés': ['Chaudière granulés', 'Silo / réserve granulés', 'Vis sans fin / aspiration', 'Ballon tampon', 'Tubage / conduit + régulation'],
  'Chaudière gaz': ['Chaudière gaz', 'Kit ventouse / conduit', 'Alimentation gaz', "Vase d'expansion", 'Thermostat / régulation'],
  'PAC Air/Eau': ['Unité extérieure', 'Module hydraulique intérieur', 'Liaisons frigorifiques', 'Support unité extérieure', 'Évacuation des condensats', 'Câble alim + protection'],
  'PAC Eau/Eau': ['PAC Eau/Eau', 'Captage / forage', 'Échangeur', 'Circulateurs', 'Ballon tampon + régulation'],
  'PAC Air/Air': ['Unité extérieure', 'Unités intérieures (splits)', 'Liaisons frigorifiques', 'Supports', 'Évacuation des condensats', 'Câble alim'],
  'Chauffe-eau thermodynamique': ['Ballon thermodynamique', 'Gaines air (si gainé)', 'Évacuation des condensats', 'Groupe de sécurité', 'Câble alimentation']
};

// Renvoie la liste de matériel suggérée pour un type (vide si inconnu)
export function materielFor(type) {
  return (MATERIEL_SUGGESTIONS[type] || []).slice();
}

// ============================================================================
// DIMENSIONNEMENT (indicatif) PAR TYPE D'APPAREIL
// Calculs simplifiés (résidentiel France) à partir des réponses de la visite.
// Toujours présenté comme "estimatif" — pas une étude BET.
// ============================================================================

// Coefficient de pertes thermiques en W/m3 selon le niveau d'isolation déclaré.
const ISO_W_PAR_M3 = { 'Faible': 80, 'Moyen': 60, 'Bon': 42, 'RT2012+': 30 };

const HEATING_TYPES = new Set([
  'Poêle ou insert bois', 'Poêle ou insert granulés',
  'Chaudière bois', 'Chaudière granulés', 'Chaudière gaz',
  'PAC Air/Eau', 'PAC Eau/Eau', 'PAC Air/Air'
]);
// Types pour lesquels on a besoin du nb pièces (ECS ou ballon thermo)
const NEEDS_NB_PIECES = new Set([
  'Poêle ou insert bois', 'Poêle ou insert granulés',
  'Chaudière bois', 'Chaudière granulés', 'Chaudière gaz',
  'PAC Air/Eau', 'PAC Eau/Eau',
  'Chauffe-eau thermodynamique'
]);

// Helpers
const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; };
const round1 = (n) => Math.round(n * 10) / 10;

// Renvoie { status: 'no-data'|'incomplete'|'ok', missing: [...], lines: [...], perRoom: [...] }.
// On NE retourne JAMAIS de valeurs estimées si un input critique est manquant —
// on liste plutôt les champs à compléter (règle "on n'invente pas").
export function computeDimensions(type, answers, splitsInt) {
  const a = answers || {};
  const surface = num(a.surface);
  const hauteur = num(a.hauteurPlafond);
  const nbPieces = num(a.nbPieces);
  const isolation = a.isolation || '';
  const splits = (splitsInt || []).filter(u => u && (u.emplacement || u.surfacePiece || u.type || u.frigoM || u.elecM || u.puissance));

  // Rien saisi du tout → état neutre (pas un blocage)
  if (!type && surface === 0 && hauteur === 0 && nbPieces === 0 && !isolation && splits.length === 0) {
    return { status: 'no-data', missing: [], lines: [], perRoom: [] };
  }

  // ===== VALIDATION STRICTE =====
  const missing = [];
  if (!type) missing.push('Type de projet');

  if (HEATING_TYPES.has(type)) {
    if (!isolation || !ISO_W_PAR_M3[isolation]) missing.push("Niveau d'isolation");
    if (hauteur <= 0) missing.push('Hauteur sous plafond (m)');

    if (type === 'PAC Air/Air') {
      // Air/Air : per-pièce obligatoire (au moins 1 split avec emplacement + surface)
      if (splits.length === 0) {
        missing.push('Au moins une unité intérieure');
      } else {
        splits.forEach((u, i) => {
          const lbl = `Unité ${i + 1}${u.emplacement ? ' (' + u.emplacement + ')' : ''}`;
          if (!(u.emplacement || '').trim()) missing.push(`${lbl} : emplacement`);
          if (num(u.surfacePiece) <= 0) missing.push(`${lbl} : surface (m²)`);
        });
      }
    } else {
      if (surface <= 0) missing.push('Surface (m²)');
    }
  }

  if (NEEDS_NB_PIECES.has(type) && nbPieces <= 0) missing.push('Nombre de pièces');

  if (missing.length) return { status: 'incomplete', missing, lines: [], perRoom: [] };

  // ===== CALCUL =====
  const coeff = ISO_W_PAR_M3[isolation];
  const lines = [];
  const perRoom = [];
  let puissanceKW = 0;

  if (type === 'PAC Air/Air') {
    for (const u of splits) {
      const sp = num(u.surfacePiece);
      const vol = sp * hauteur;
      const p = round1((vol * coeff) / 1000);
      perRoom.push({
        emplacement: (u.emplacement || '').trim(),
        surface: sp,
        puissance: p,
        type: u.type || ''
      });
      puissanceKW = round1(puissanceKW + p);
    }
    lines.push({
      label: 'Puissance totale (somme des pièces)',
      value: `${puissanceKW} kW`,
      hint: `Isolation ${isolation} : ${coeff} W/m³ · hauteur ${hauteur} m`
    });
  } else if (HEATING_TYPES.has(type)) {
    const vol = surface * hauteur;
    puissanceKW = round1((vol * coeff) / 1000);
    lines.push({
      label: 'Puissance chauffage recommandée',
      value: `${puissanceKW} kW`,
      hint: `Volume ${Math.round(vol)} m³ × ${coeff} W/m³ (isolation ${isolation})`
    });
  }

  // ECS standard (hors Air/Air et hors CET qui a son propre dimensionnement ballon)
  if (NEEDS_NB_PIECES.has(type) && type !== 'Chauffe-eau thermodynamique') {
    const nbPers = Math.max(1, nbPieces - 1);
    const volECS = Math.max(100, nbPers * 50);
    lines.push({ label: 'Volume ECS recommandé', value: `${volECS} L`, hint: `${nbPers} personne(s) × 50 L` });
  }

  // Tubage bois
  if (type === 'Poêle ou insert bois' || type === 'Chaudière bois') {
    lines.push({
      label: 'Diamètre tubage suggéré',
      value: puissanceKW < 10 ? 'Ø150 mm' : (puissanceKW < 16 ? 'Ø180 mm' : 'Ø200+ mm'),
      hint: 'Indicatif — vérifier la notice constructeur'
    });
  }
  // Granulés : tubage + stockage
  if (type === 'Poêle ou insert granulés' || type === 'Chaudière granulés') {
    lines.push({ label: 'Diamètre tubage suggéré', value: 'Ø80 mm (étanche) ou Ø100 mm' });
    lines.push({
      label: 'Stockage granulés estimé (1 saison)',
      value: `${round1(puissanceKW * 0.4)} m³/an`,
      hint: '~0,4 m³ par kW (≈ 4500 kWh/t, ~1800 h chauffe/an, charge 70 %)'
    });
    lines.push({
      label: 'Silo recommandé',
      value: `${Math.max(2, Math.ceil(puissanceKW * 0.5))} m³`,
      hint: 'Capacité ½ à 1 saison'
    });
  }
  // Chaudière bois/granulés : ballon tampon
  if (type === 'Chaudière bois' || type === 'Chaudière granulés') {
    lines.push({
      label: 'Ballon tampon recommandé',
      value: `${Math.round(puissanceKW * 17)} L`,
      hint: '≈ 15-20 L par kW'
    });
  }
  // Gaz
  if (type === 'Chaudière gaz') {
    lines.push({ label: 'Évacuation suggérée', value: 'Ventouse Ø60-100 mm (type C, étanche)' });
  }
  // PAC Air/Eau
  if (type === 'PAC Air/Eau') {
    lines.push({
      label: 'Puissance frigorifique unité ext.',
      value: `${round1(puissanceKW / 0.95)} kW`,
      hint: 'COP supposé ≈ 3,5 ; majoration ~5 % pour pertes annexes'
    });
  }
  // PAC Eau/Eau
  if (type === 'PAC Eau/Eau') {
    lines.push({
      label: 'Captage horizontal — surface',
      value: `${Math.round(surface * 2)} m²`,
      hint: '≈ 2× la surface à chauffer (variable selon sol)'
    });
    lines.push({
      label: 'Sondes verticales — linéaire total',
      value: `${Math.round(puissanceKW * 20)} m`,
      hint: '~20 m/kW (très variable selon sous-sol)'
    });
  }
  // PAC Air/Air : totaux frigo/élec + pré-charge (les splits avec longueurs renseignées)
  if (type === 'PAC Air/Air') {
    const withLen = splits.filter(u => num(u.frigoM) > 0 || num(u.elecM) > 0);
    if (withLen.length) {
      const totalFrigo = round1(withLen.reduce((s, u) => s + num(u.frigoM), 0));
      const totalElec = round1(withLen.reduce((s, u) => s + num(u.elecM), 0));
      lines.push({ label: 'Liaisons frigo totales', value: `${totalFrigo} m`, hint: `${withLen.length} unité(s) avec longueur renseignée` });
      lines.push({ label: 'Liaisons élec totales', value: `${totalElec} m`, hint: 'Câble multi-conducteurs (alim + communication) entre unité ext. et chaque unité int.' });
      const surcharge = Math.max(0, totalFrigo - 7);
      lines.push({
        label: 'Pré-charge fluide R32',
        value: surcharge > 0 ? `${Math.round(surcharge * 30)} g supplémentaires` : 'Aucune (≤ 7 m)',
        hint: '30 g/m au-delà de 7 m (vérifier notice fabricant)'
      });
    }
  }
  // CET
  if (type === 'Chauffe-eau thermodynamique') {
    const nbPers = Math.max(1, nbPieces - 1);
    const v = nbPers <= 4 ? 200 : (nbPers <= 5 ? 270 : 300);
    lines.push({ label: 'Volume ballon recommandé', value: `${v} L`, hint: `${nbPers} personne(s)` });
  }

  return { status: 'ok', missing: [], lines, perRoom };
}
