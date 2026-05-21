# Journal des modifications

Toutes les évolutions notables de l'app **INSTANT BY PINTO — Visites techniques**.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/).

## [1.0.1] - 2026-05-21

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
