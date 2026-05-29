# Journal des modifications

Toutes les évolutions notables de l'app **INSTANT BY PINTO — Visites techniques**.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/).

## [1.5.0] - 2026-05-22

### Ajouté — Croquis & schémas
- Nouveau type d'entrée : **croquis dessiné** directement sur le téléphone.
- Carte « ✏️ Croquis & schémas » avec grille de vignettes + bouton
  « + Nouveau croquis » qui ouvre un **éditeur plein écran** :
  - **Crayon** (3 épaisseurs) + **4 couleurs** (marron / rouge / bleu / vert)
  - **Gomme**
  - **Photo en fond** : charger une photo et annoter par-dessus (utile pour
    schématiser sur une photo du tableau élec, du conduit existant, etc.)
  - Effacer tout, Annuler, Enregistrer
- Multi-croquis avec libellé par croquis (ex: « salon », « conduit », « tableau »).
- Re-édition possible en cliquant la vignette.
- Nouvelle colonne Airtable `Croquis` (multipleAttachments) sur Visites
  techniques + endpoint `/api/upload-croquis` (même mécanique que photos).
- Section dédiée dans le PDF (2 croquis par ligne).

## [1.4.0] - 2026-05-22

### Ajouté — Dimensionnement (indicatif) par type d'appareil
- Nouvelle carte « 📐 Dimensionnement (indicatif) » qui **calcule en direct**
  à partir des réponses (surface, hauteur, isolation, nb pièces) :
  - **Puissance chauffage** recommandée en kW (coefficient W/m³ par niveau
    d'isolation : Faible 80 / Moyen 60 / Bon 42 / RT2012+ 30).
  - **Volume ECS** recommandé selon nb personnes estimé.
  - Spécifique au type : diamètre tubage suggéré (bois/granulés/gaz),
    **stockage granulés** (m³/an) + silo recommandé, ballon tampon
    (chaudière bois/granulés), captage horizontal + sondes verticales
    (PAC Eau/Eau), totaux liaisons frigo/élec + pré-charge R32
    (PAC Air/Air, calculé depuis les splits), ballon CET selon famille.
- Toutes les estimations marquées « indicatif — à confirmer par BET sur les
  projets sensibles ». Override manuel possible via les champs amont.
- Section dédiée dans le rapport PDF.

## [1.3.0] - 2026-05-22

### Ajouté — table Clients/Prospects dédiée aux visites
- Nouvelle table Airtable **`Clients/Prospects`** dans la base des visites,
  séparée de la base maintenance Entretien & Ramonage.
  Champs : Nom complet · Téléphone · Email · Adresse · CP · Ville ·
  Origine (Prospect / Devis envoyé / Client / Recommandation / Site internet /
  Téléphone) · Notes.
- Nouveau champ `Client/Prospect` (lien) sur « Visites techniques » → 1 fiche
  client = N visites/chantiers, historique propre par client.
- Endpoint `/api/prospects` : GET (recherche), GET/:id (lecture pour ré-affichage),
  POST (création). Whitelist d'écriture stricte (`PROSPECT_WRITABLE`).
- Formulaire visite : nouveau bloc **« Client / Prospect (Visites) »** —
  recherche dans la table dédiée, bouton **« + Créer ce client/prospect avec
  les infos saisies »**, pastille verte du client lié + bouton Délier.
- L'ancienne recherche **« Entretien & Ramonage »** (base maintenance) reste
  disponible mais repliée sous un volet secondaire (`<details>`), clarifiant
  la séparation entre maintenance et prospects/clients visites.

### Modifié
- `VERSION` du Service Worker → v1.3.0 ; `package.json` → 1.3.0.
- `_lib.js` : ajout de `TABLES.PROSPECTS`, `FIELDS.prospect`, `PROSPECT_WRITABLE`,
  champ `clientProspect` sur la visite, `'Client/Prospect'` ajouté à
  `VISITE_WRITABLE`.

## [1.2.0] - 2026-05-22

### Corrigé
- **PDF d'aperçu** : ouvrait une **page blanche** sur mobile
  (`dataurlnewwindow` mal supporté par les data-URL longues). Remplacé par un
  téléchargement du PDF d'aperçu (préfixe `apercu-`), comme à la validation.

### Ajouté — fluidité de saisie
- **Sections communes ouvertes par défaut** (Client/Accès/Électricité) : plus
  besoin de déplier à chaque visite.
- **Boutons segmentés** pour tous les choix courts Oui / Non / À vérifier et
  autres listes 2-4 options (logement, isolation, état conduit, devoiement,
  alim gaz, etc.) → **1 tap au lieu de 3** (ouvrir le select / choisir / fermer).
- **Clavier adapté au mobile** (`inputmode`) sur les champs texte numériques :
  année, surface terrain, diamètre conduit, puissance, distance, etc.

### Ajouté — PAC Air/Air : détail par unité intérieure
- Nouveau type de champ `unit-list` : la section « Unités intérieures (Air/Air) »
  devient une **liste répétable**, **1 ligne = 1 split**, avec :
  - emplacement / pièce
  - type (Mural / Cassette / Console / Gainable, en boutons)
  - longueurs **liaison frigo** et **câble élec** propres à chaque unité
  - puissance optionnelle (kW)
- Tableau récapitulatif (avec **totaux frigo / élec**) ajouté au PDF.

### Modifié
- `VERSION` du Service Worker → v1.2.0 ; `package.json` → 1.2.0.
- Ancien bloc « Unités intérieures » (champs uniques globaux) remplacé par la
  liste détaillée — `nbUnitesInt`, `typeUnites`, `empSplits` retirés (présents
  dans l'ancien JSON, ignorés sans erreur).

## [1.1.0] - 2026-05-22

### Ajouté — la visite devient le fil conducteur du chantier
- **Préparation matériel** : liste éditable du matériel à prévoir/commander
  (désignation, quantité, note) avec un bouton « Proposer le matériel type »
  qui pré-remplit une base selon le type de projet. Reprise dans le PDF.
- **Travaux préalables = checklist** : les points bloquants à lever avant la
  pose deviennent des tâches cochables (suivies), au lieu d'un simple texte.
- **Pipeline de suivi** : nouveau champ `Statut chantier`
  (À planifier → Devis → Planifié → Posé → SAV / Annulé), affiché en badge
  sur le dashboard, pour suivre le projet dans la même fiche.
- **Planification de pose** : `Date pose prévue`, `Équipe pose` et durée estimée.
- Bloc « Préparation du chantier à venir » ajouté au rapport PDF (statut,
  planning, tableau matériel, checklist des travaux préalables).

### Modifié
- Airtable : 3 colonnes ajoutées à « Visites techniques » (`Statut chantier`,
  `Date pose prévue`, `Équipe pose`) ; matériel + checklist stockés dans
  `Réponses (JSON)`. Les colonnes Airtable font autorité au ré-affichage
  (on peut faire avancer le pipeline directement dans Airtable).
- `VERSION` du Service Worker → v1.1.0 ; `package.json` → 1.1.0.
- Suppression d'un import/variable inutilisés (`buildLabelIndex`/`LABELS`) dans `visite.js`.

## [1.0.1] - 2026-05-21

### Ajouté
- Icônes PWA `icon-192.png` et `icon-512.png` générées depuis `icon.svg`
  (référencées par le manifest et le Service Worker, `purpose: any maskable`).
  La PWA dispose désormais d'icônes PNG pour l'installation. (`public/icons/`)

### Corrigé
- **PWA / hors-ligne** : le pré-cache du Service Worker utilisait `cache.addAll`
  (atomique) — un seul asset manquant (les icônes PNG `icon-192`/`icon-512` pas
  encore générées renvoyaient un 404) faisait échouer **tout** le pré-cache et
  rendait le mode hors-ligne silencieusement inopérant. Remplacé par un cache
  item par item tolérant aux échecs (`Promise.allSettled`). (`public/sw.js`)
- **Service Worker** : le fallback réseau renvoyait l'app shell (`dashboard.html`)
  pour **n'importe quelle** requête échouée, y compris un JS/CSS/image — désormais
  restreint aux requêtes de navigation. (`public/sw.js`)
- **Connexion** : les noms de techniciens (issus d'Airtable) étaient injectés en
  `innerHTML` sans échappement, contrairement au reste de l'app. Ajout de
  `escapeHtml`. (`public/js/login.js`)

### Modifié
- `VERSION` du Service Worker bumpée en `v1.0.1` pour forcer la mise à jour du
  cache chez les clients. (`public/sw.js`)
- `version` de `package.json` alignée sur `1.0.1`.

## [1.0.0] - 2026-05

### Ajouté
- Version initiale.
- Authentification multi-technicien : table Airtable `Techniciens` (PIN hashé
  SHA-256, comparaison timing-safe), fallback PIN global, sessions signées
  HMAC-SHA256 (TTL 12 h), rate-limit login via Netlify Blobs (fail-open).
- Dashboard des visites (onglets aujourd'hui / semaine / tout + recherche).
- Formulaire dynamique data-driven pour les 9 types de projet (poêles/inserts,
  chaudières bois/granulés/gaz, PAC Air/Eau, Eau/Eau, Air/Air, CET).
- Photos compressées côté client + position GPS + dictée vocale, signatures
  tactiles technicien & client.
- Rapport PDF aux couleurs IBP (jsPDF + autoTable), généré côté client.
- PWA installable + hors-ligne (Service Worker + manifest).
- Backend Netlify Functions ↔ Airtable (base dédiée `appiH3g9J0B9tdbIE`),
  recherche client en lecture seule sur la base maintenance.
