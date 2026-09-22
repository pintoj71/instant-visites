# INSTANT BY PINTO — App Visites techniques

Web-app mobile-first pour réaliser la **visite technique avant installation** (étude de faisabilité)
d'un appareil de chauffage et générer un **rapport PDF** à remettre au client.

- Sans build step (HTML/CSS/JS pur, ES modules) — éditable depuis iPhone / Surface / github.dev.
- Frontend statique → Netlify Functions → Airtable. PDF généré côté client (jsPDF).
- PWA installable + hors-ligne.

Voir [`CLAUDE.md`](CLAUDE.md) pour l'architecture détaillée, le data model et les pièges connus.

## 1. Mise en route locale

```bash
npm install
cp .env.example .env   # puis renseigner les valeurs
npm run dev            # netlify dev (http://localhost:8888)
```

Variables d'environnement (`.env` en local, **Site config → Environment variables** sur Netlify) :

| Variable | Rôle |
|---|---|
| `AIRTABLE_API_KEY` | Token personnel Airtable (scopes data.records:read/write) |
| `AIRTABLE_BASE_ID` | Base dédiée des visites : `appiH3g9J0B9tdbIE` |
| `AIRTABLE_CLIENTS_BASE_ID` | Base maintenance (lecture seule, recherche client) : `appCSUjH1ht16bL97` — optionnel |
| `APP_PIN` | PIN global de secours |
| `APP_SECRET` | Secret de signature des sessions (≥ 32 caractères aléatoires) |

Générer un `APP_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Base Airtable

La base **`Visites techniques INSTANT BY PINTO`** (`appiH3g9J0B9tdbIE`) est **déjà créée** avec les
tables `Visites techniques` et `Techniciens` et tous leurs champs. Aucune action de structure requise.

### Créer les comptes techniciens

1. Ouvrir l'outil de hash : `/outils/pin-hash.html` (sur le site déployé ou en local).
2. Saisir le PIN du technicien → copier le **hash SHA-256**.
3. Dans la table **Techniciens** : créer une ligne `Nom` = prénom/nom, `PIN` = le hash collé,
   cocher **Actif**.

Le menu déroulant de connexion se remplit automatiquement avec les techniciens actifs.
Sans aucun technicien, l'app retombe sur le **PIN global** (`APP_PIN`) avec saisie libre du nom.

## 3. Icônes PWA

Ouvrir `/icons/generate.html`, télécharger `icon-192.png` et `icon-512.png`, les déposer dans
`public/icons/`. (L'icône SVG fonctionne déjà sans cette étape sur les navigateurs récents.)

## 4. Déploiement Netlify

1. Pousser le repo sur GitHub.
2. Netlify → **Add new site → Import an existing project** → sélectionner le repo.
   - Publish directory : `public` · Functions : `netlify/functions` (déjà dans `netlify.toml`).
3. Renseigner les **variables d'environnement** (section 1).
4. Déploiement **automatique à chaque push sur `main`**.

> Netlify Blobs (rate-limit login) est activé automatiquement sur les sites Netlify récents.

## 5. Utilisation terrain

1. Connexion (technicien + PIN).
2. **+ Nouvelle visite** → choisir le **type de projet** (affiche les sections spécifiques).
3. Remplir client/lieu, accès, électricité, section technique du type, photos (caméra arrière,
   compressées), faisabilité, signatures. Dictée vocale 🎤 sur les champs libres. 📍 GPS optionnel.
4. **Brouillon** pour reprendre plus tard, ou **Valider** pour générer/archiver le PDF.

Sauvegarde locale automatique : une visite interrompue se restaure au rechargement.

## Vérifier les régressions

`npm ci` puis `npm test`. Les tests utilisent un DOM et une API simulés, sans écrire dans Airtable.
