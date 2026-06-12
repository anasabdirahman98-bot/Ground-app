# GROUND — Application de gestion de complexe sportif

PWA mobile-first pour la gestion des terrains de foot à 5/7 (réservations, caisse, dashboard gérant).

---

## Prérequis

- Compte [Firebase](https://firebase.google.com/) (gratuit)
- Compte [GitHub](https://github.com/) pour l'hébergement Pages

---

## 1. Créer le projet Firebase

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com/)
2. **Créer un projet** → nommer le projet (ex. `ground-complexe`)
3. Dans le projet → **Authentication** → Commencer → activer **Email/Mot de passe**
4. Dans **Realtime Database** → Créer une base → choisir la région **europe-west1** (Belgique, la plus proche)
5. Démarrer en **mode verrouillé** (les règles seront déployées juste après)

---

## 2. Récupérer la configuration

1. Paramètres du projet (icône engrenage) → **Vos applications** → Ajouter une application Web
2. Copier les valeurs `firebaseConfig`

---

## 3. Configurer l'app

```bash
cp js/firebase-config.example.js js/firebase-config.js
```

Éditer `js/firebase-config.js` et remplacer les valeurs `YOUR_*` par vos vraies clés.

> Ne jamais commiter `firebase-config.js` — il est dans `.gitignore`.

---

## 4. Déployer les règles de sécurité

### Option A — Firebase CLI (recommandé)

```bash
npm install -g firebase-tools
firebase login
firebase init database   # sélectionner le projet, pointer vers database.rules.json
firebase deploy --only database
```

### Option B — Console Firebase

1. Realtime Database → **Règles**
2. Coller le contenu de `database.rules.json` → Publier

---

## 5. Créer le premier compte gérant

Les comptes se créent **depuis l'interface Firebase** pour le tout premier gérant :

1. Firebase Console → **Authentication** → Ajouter un utilisateur
2. Entrer email + mot de passe
3. Copier l'**UID** généré
4. Realtime Database → onglet **Données** → Ajouter manuellement :

```json
{
  "users": {
    "VOTRE_UID": {
      "nom": "Votre Nom",
      "email": "votre@email.com",
      "role": "gerant",
      "actif": true,
      "telephone": "",
      "createdAt": 0
    }
  }
}
```

Le gérant peut ensuite créer des comptes employés depuis l'app (Config → Employés).

---

## 6. Déployer sur GitHub Pages

1. Pusher le repo sur GitHub
2. Settings → Pages → Source : **Deploy from a branch** → branche souhaitée / `(root)`
3. Attendre ~1 min → l'URL apparaît (ex. `https://user.github.io/ground-app/`)

> GitHub Pages sert les fichiers statiques sans build. Aucune étape de compilation requise.

---

## 7. Données de démonstration

Une fois connecté en tant que gérant, ouvrir la console développeur (F12) et coller le contenu de `seed.js`. Le script crée :

- 3 terrains, horaires 08h–minuit, tarifs jour/soir
- 6 clients fictifs
- Une semaine de réservations (dont no-shows, annulations, impayés)
- Une clôture de caisse J-1 avec écart de -500 FDJ

---

## Architecture

```
index.html              SPA shell + routeur + initialisation
css/tokens.css          Design tokens (couleurs, typo, espacement)
css/app.css             Styles complets
js/firebase-config.js   Clés Firebase (gitignorée)
js/db.js                Couche d'accès données (RTDB)
js/auth.js              Authentification + gestion des comptes
js/planning.js          Grille planning + formulaires réservation
js/caisse.js            Caisse du jour + clôture
js/clients.js           Gestion clients + impayés
js/dashboard.js         Dashboard gérant (CA, occupation, journal)
js/config.js            Configuration complexe + employés
js/utils.js             Utilitaires (formatage, dates, créneaux)
sw.js                   Service worker (cache app-shell)
database.rules.json     Règles de sécurité RTDB
seed.js                 Données de démonstration
```

---

## Règles de sécurité clés

- **Paiements** : création uniquement (`!data.exists()`), jamais modifiables
- **Slots** : transaction anti-conflit sur la clé `terrainId_créneau`
- **Clôtures** : une seule écriture par date
- **Réservations** : pas de suppression physique (`newData.exists()` requis)
- **Journal** : append-only, lecture gérant uniquement

---

## Feuille de route

- **Phase 2** : réservations récurrentes, stats avancées, bouton WhatsApp, export CSV
- **Phase 3** : tournois, page publique client, multi-complexes, SMS
