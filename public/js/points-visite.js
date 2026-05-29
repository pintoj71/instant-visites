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
      { key: 'typeLogement', label: 'Type de logement', type: 'segmented', options: ['Maison', 'Appartement'] },
      { key: 'anneeConstruction', label: 'Année de construction', type: 'text', inputMode: 'numeric' },
      { key: 'surface', label: 'Surface à chauffer (m2)', type: 'number' },
      { key: 'nbPieces', label: 'Nombre de pièces', type: 'number' },
      { key: 'hauteurPlafond', label: 'Hauteur sous plafond (m)', type: 'number', step: '0.1' },
      { key: 'isolation', label: "Niveau d'isolation", type: 'segmented', options: ['Faible', 'Moyen', 'Bon', 'RT2012+'] }
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

// Helpers
const num = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; };
const round1 = (n) => Math.round(n * 10) / 10;

// Renvoie un tableau de lignes { label, value, hint? } à afficher / mettre dans le PDF.
// answers = réponses saisies (collectData), splitsInt = liste des unités intérieures (PAC Air/Air).
export function computeDimensions(type, answers, splitsInt) {
  const a = answers || {};
  const surface = num(a.surface);
  const hauteur = num(a.hauteurPlafond) || 2.5;
  const nbPieces = num(a.nbPieces);
  const isolation = a.isolation || 'Moyen';
  const coeff = ISO_W_PAR_M3[isolation] || 60;
  const out = [];

  // Puissance chauffage (commun à tous les générateurs de chaud)
  let puissanceKW = 0;
  if (surface > 0) {
    const volume = surface * hauteur;
    puissanceKW = round1((volume * coeff) / 1000);
    out.push({
      label: 'Puissance chauffage recommandée',
      value: `${puissanceKW} kW`,
      hint: `Volume ${Math.round(volume)} m³ × ${coeff} W/m³ (isolation ${isolation})`
    });
  }

  // Nb personnes estimé + volume ECS de base
  const nbPers = Math.max(1, nbPieces ? nbPieces - 1 : 3);
  if (type !== 'PAC Air/Air') {
    const volECS = Math.max(100, nbPers * 50);
    out.push({
      label: 'Volume ECS recommandé',
      value: `${volECS} L`,
      hint: `≈ ${nbPers} personne(s) × 50 L`
    });
  }

  // Bois / granulés : conduit + (granulés) stockage
  if (type === 'Poêle ou insert bois' || type === 'Chaudière bois') {
    out.push({
      label: 'Diamètre tubage suggéré',
      value: puissanceKW < 10 ? 'Ø150 mm' : (puissanceKW < 16 ? 'Ø180 mm' : 'Ø200+ mm'),
      hint: 'Indicatif — vérifier la notice constructeur'
    });
  }
  if (type === 'Poêle ou insert granulés' || type === 'Chaudière granulés') {
    out.push({ label: 'Diamètre tubage suggéré', value: 'Ø80 mm (étanche) ou Ø100 mm' });
    if (puissanceKW > 0) {
      out.push({
        label: 'Stockage granulés estimé (1 saison)',
        value: `${round1(puissanceKW * 0.4)} m³/an`,
        hint: `~0,4 m³ par kW (≈ 4500 kWh/t, ~1800 h chauffe/an, charge 70 %)`
      });
      out.push({
        label: 'Silo recommandé',
        value: `${Math.max(2, Math.ceil(puissanceKW * 0.5))} m³`,
        hint: 'Capacité ½ à 1 saison'
      });
    }
  }
  if (type === 'Chaudière bois' || type === 'Chaudière granulés') {
    if (puissanceKW > 0) {
      out.push({
        label: 'Ballon tampon recommandé',
        value: `${Math.round(puissanceKW * 17)} L`,
        hint: '≈ 15-20 L par kW de puissance'
      });
    }
  }

  // Gaz
  if (type === 'Chaudière gaz') {
    out.push({ label: 'Évacuation suggérée', value: 'Ventouse Ø60-100 mm (type C, étanche)' });
  }

  // PAC Air/Eau
  if (type === 'PAC Air/Eau' && puissanceKW > 0) {
    out.push({
      label: 'Puissance frigorifique unité ext.',
      value: `≈ ${round1(puissanceKW / 0.95)} kW`,
      hint: 'COP supposé ≈ 3,5 ; majoration ~5 % pour pertes annexes'
    });
  }

  // PAC Eau/Eau captage
  if (type === 'PAC Eau/Eau' && puissanceKW > 0) {
    out.push({
      label: 'Captage horizontal — surface',
      value: `${Math.round(surface * 2)} m²`,
      hint: '≈ 2× la surface à chauffer (variable selon sol)'
    });
    out.push({
      label: 'Sondes verticales — linéaire total',
      value: `${Math.round(puissanceKW * 20)} m`,
      hint: '~20 m/kW (très variable selon sous-sol)'
    });
  }

  // PAC Air/Air : total liaisons frigo (somme des splits) + pré-charge
  if (type === 'PAC Air/Air') {
    const splits = (splitsInt || []).filter(u => u && (num(u.frigoM) > 0 || num(u.elecM) > 0 || u.emplacement));
    if (splits.length) {
      const totalFrigo = round1(splits.reduce((s, u) => s + num(u.frigoM), 0));
      const totalElec = round1(splits.reduce((s, u) => s + num(u.elecM), 0));
      out.push({ label: 'Liaisons frigo totales', value: `${totalFrigo} m`, hint: `${splits.length} unité(s) intérieure(s)` });
      out.push({ label: 'Câble élec total', value: `${totalElec} m` });
      const surcharge = Math.max(0, totalFrigo - 7);
      out.push({
        label: 'Pré-charge fluide R32',
        value: surcharge > 0 ? `${Math.round(surcharge * 30)} g supplémentaires` : 'Aucune (≤ 7 m)',
        hint: '30 g/m au-delà de 7 m (vérifier la notice fabricant)'
      });
    }
  }

  // Chauffe-eau thermodynamique : ballon selon nb pers
  if (type === 'Chauffe-eau thermodynamique') {
    const v = nbPers <= 4 ? 200 : (nbPers <= 5 ? 270 : 300);
    out.push({ label: 'Volume ballon recommandé', value: `${v} L`, hint: `≈ ${nbPers} personne(s)` });
  }

  return out;
}
