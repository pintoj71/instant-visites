# Projet : INSTANT BY PINTO — App Visites techniques

> Web-app mobile-first pour réaliser sur le terrain la **visite technique d'un chantier avant
> installation** (étude de faisabilité) d'un appareil de chauffage, et générer un **rapport PDF**
> à remettre au client. Connectée à Airtable, déployée sur Netlify. App soeur de `instant-attestations`.

## Périmètre métier

INSTANT BY PINTO installe : poêles/inserts bois & granulés, PAC (Air/Air, Air/Eau, Eau/Eau),
chaudières (bois, granulés, gaz), chauffe-eau thermodynamiques.

Le technicien choisit un **Type de projet** ; le formulaire affiche alors des **sections communes**
+ des **sections conditionnelles** propres au type. À la fin : conclusion de faisabilité, photos,
signatures, et génération PDF.

### Types de projet gérés (champ détecteur `Type de projet`)
Poêle ou insert bois · Poêle ou insert granulés · Chaudière bois · Chaudière granulés ·
Chaudière gaz · PAC Air/Eau · PAC Eau/Eau · PAC Air/Air · Chauffe-eau thermodynamique.

## Architecture

Stack **volontairement sans build step** (éditable depuis iPhone / Surface / github.dev) :

```
Frontend statique (HTML/CSS/JS pur, ES modules natifs)
        ↓ fetch /api/*
Netlify Functions (Node 18+, ESM, esbuild)
        ↓ fetch
Airtable REST API (+ Content API pour les pièces jointes)
```

- Pas de framework, pas de bundler, pas de TypeScript.
- jsPDF + autoTable chargés **via CDN à la demande** pour générer le PDF **côté client**.
- PWA installable + offline (Service Worker + manifest).
- Compression des photos **côté client** (canvas, max 1200x1200, JPEG q≈0.72) avant upload.

## Source de données — Airtable

**Base DÉDIÉE** : `Visites techniques INSTANT BY PINTO` — `appiH3g9J0B9tdbIE`
(distincte de la base maintenance `appCSUjH1ht16bL97`, interrogée seulement en lecture pour la
recherche client de pré-remplissage).

| Table | ID | Rôle |
|---|---|---|
| Visites techniques | `tbl00bDbH7524lOq1` | 1 ligne par visite |
| Techniciens | `tblYH9sqJeyHv1eLU` | Comptes (Nom + PIN hashé + Actif) |

**Champs `Visites techniques`** (IDs dans `netlify/functions/_lib.js` → `FIELDS.visite`) :
Client, Téléphone, Email, Adresse, Type de logement, **Type de projet**, Date visite, Technicien,
Statut, Faisabilité, Estimation budgétaire, Délai indicatif, **Réponses (JSON)**, Photos (attachment),
Signature technicien (base64), Signature client (base64), PDF rapport (attachment),
Réf. client (Abonnements).

> ⚠️ **Toutes les réponses détaillées** (sections communes + conditionnelles) sont stockées dans
> **un seul champ Long Text `Réponses (JSON)`** — on NE multiplie PAS les colonnes. Seuls les champs
> filtrables (type, statut, faisabilité, dates, client) ont leur propre colonne.

**Champs `Techniciens`** : Nom, PIN (hash SHA-256 hex), Actif (checkbox).

## Sécurité

- `AIRTABLE_API_KEY` jamais exposée au frontend (toujours via Functions).
- **Auth multi-technicien** : table `Techniciens` (PIN hashé SHA-256, comparaison timing-safe),
  **fallback** sur le PIN global `APP_PIN`. Cookie de session signé **HMAC-SHA256** (`APP_SECRET`),
  TTL 12 h, `HttpOnly; Secure; SameSite=Strict`.
- **Rate-limit login** via **Netlify Blobs** : 5 échecs (par IP **et** par nom) → blocage 15 min.
  Dégrade proprement (fail-open) si Blobs indisponible en local.
- **En-têtes** (`netlify.toml`) : CSP stricte (seule source externe = `cdn.jsdelivr.net`),
  HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)`.
- **Validation API** : `isValidRecordId` (`/^rec[A-Za-z0-9]{14}$/`) sur tout endpoint à ID ;
  **whitelist stricte** des champs en écriture (`VISITE_WRITABLE` + `pickWritable`) ;
  échappement des quotes dans les formules Airtable (`escapeFormula`).
- PIN hashé : note — un PIN à 4 chiffres reste faible en soi, mais le hash **ne quitte jamais le
  serveur** (`techniciens.js` ne renvoie que les noms). Le hash protège surtout contre la lecture
  directe du PIN dans l'UI Airtable.

## Structure des fichiers

```
public/
├── index.html / js/login.js          # Connexion (menu technicien + PIN)
├── dashboard.html / js/dashboard.js  # Liste visites (tabs today/week/all) + recherche
├── visite.html / js/visite.js        # Formulaire dynamique (cœur de l'app)
├── js/points-visite.js               # Définition des sections/champs par type (DATA-DRIVEN)
├── js/pdf-generator.js               # Rapport PDF (jsPDF) aux couleurs IBP
├── js/logo.js                        # Logo officiel embarqué (base64) pour le PDF
├── js/signature.js                   # Pad de signature tactile
├── js/api.js                         # Wrapper fetch + toast + helpers
├── css/style.css                     # Design system (palette marron/bordeaux/terracotta/crème)
├── outils/pin-hash.html              # Outil : générer le hash d'un PIN technicien
├── icons/ (icon.svg + generate.html) # Icônes PWA (générer les PNG via generate.html)
├── sw.js / manifest.json             # PWA
netlify/functions/
├── _lib.js          # Airtable (2 bases) + auth HMAC + hash PIN + rate-limit Blobs + IDs + helpers
├── login.js logout.js me.js techniciens.js
├── visites.js       # GET liste/détail (?when=, ?q=), POST, PATCH (whitelist)
├── clients.js       # GET recherche read-only base maintenance (pré-remplissage)
├── upload-pdf.js    # POST PDF en pièce jointe (Content API)
└── upload-photo.js  # POST photo en pièce jointe (Content API, 1 appel/photo)
```

## Modèle data-driven (ajouter un type)

Tout est dans `public/js/points-visite.js` :
1. Ajouter l'option dans Airtable (champ `Type de projet`) ET dans `TYPES_PROJET`.
2. Si besoin d'un nouveau bloc de champs : l'ajouter dans `TYPE_BLOCKS`.
3. Mapper le type → blocs dans `SECTIONS_BY_TYPE`.

Le rendu, l'autosave, le PDF et la restauration sont automatiques (basés sur les `key` des champs,
qui doivent rester **stables**). Le PDF lit les mêmes définitions.

## Flux de sauvegarde (v1.8.0)

1. Autosave local par technicien, y compris pour une visite existante. Les signatures et le départ de page déclenchent la sauvegarde. Stockage plein : avertissement explicite, aucune suppression silencieuse des photos.
2. **Enregistrer en ligne** : POST/PATCH en Brouillon, envoi des pièces jointes, conservation des légendes, confirmation après succès. Les champs effacés sont transmis avec null (liens : []).
3. **Terminer la visite** : contrôle des données et signatures → sauvegarde en Brouillon → pièces jointes → PDF → upload PDF → PATCH Terminée en dernier.
4. Pendant une opération, les autres actions et la saisie sont verrouillées. Une erreur conserve le brouillon local.
5. À la première création, l'URL et la clé locale suivent l'ID Airtable. Noms de fichiers uniques conservés pour reconnaître un upload déjà réussi.
6. Le PDF attend toutes les pièces jointes existantes. Les libellés sont stockés dans Réponses (JSON), par nom de fichier.

## Limites et vérifications

- `npm test` : scénarios avec DOM et API simulée (restauration, échecs d'envoi, clôture, signatures, pagination et 9 types).
- Pas de garantie de fonctionnement intégral hors ligne : ouvrir une visite nécessite une session serveur ; PDF chargé via CDN. Une visite déjà ouverte conserve les modifications localement tant que le quota le permet.
- En cas de conflit avec une version en ligne, le technicien choisit la version à reprendre. Pas de fusion automatique des modifications de plusieurs appareils.
- Les contrôles techniques imposent un minimum de description, sans certification réglementaire. Une section peut être explicitement non applicable.
- Bumper VERSION dans public/sw.js pour chaque mise à jour visible.
- Dates civiles YYYY-MM-DD : ne pas les convertir en Date UTC pour affichage.
- Police PDF standard : éviter les glyphes hors Latin-1.
- Ne pas changer la structure Airtable sans accord.

## Variables d'environnement (Netlify + .env local)

`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (=`appiH3g9J0B9tdbIE`),
`AIRTABLE_CLIENTS_BASE_ID` (=`appCSUjH1ht16bL97`, optionnel), `APP_PIN`, `APP_SECRET`.

## Pour Claude Code dans ce repo

- Préférer **éditer** plutôt que créer des fichiers.
- Ne pas toucher à la structure Airtable sans demander.
- IDs Airtable centralisés dans `netlify/functions/_lib.js`.
- Déploiement Netlify automatique sur push `main` (pas de build manuel).

## Historique des évolutions

- **v1.0.0** (2026-05) — Version initiale : auth multi-technicien (Blobs rate-limit, PIN hashé),
  dashboard, formulaire dynamique pour les 9 types, photos compressées + GPS + dictée vocale,
  rapport PDF IBP, PWA. Base Airtable dédiée créée.
