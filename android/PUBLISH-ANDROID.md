# Publier GROUND sur le Play Store (TWA)

Ce guide explique comment transformer la PWA GROUND en application Android
(via **Trusted Web Activity** — une coque qui affiche l'appli web en plein écran,
sans barre d'URL) et la publier sur le Google Play Store.

L'appli reste hébergée sur GitHub Pages : l'APK ne fait qu'afficher
`https://anasabdirahman98-bot.github.io/Ground-app/`. Chaque mise à jour du site
est donc **automatiquement** répercutée dans l'app, sans republier sur le Play Store.

---

## Prérequis

| Élément | Détail |
|---|---|
| Compte Google Play Developer | 25 $ une seule fois — https://play.google.com/console/signup |
| PWABuilder | Gratuit — https://www.pwabuilder.com (génère l'`.aab` sans Android Studio) |
| Le fichier `assetlinks.json` hébergé à la racine du domaine | voir étape 3 (point délicat) |

---

## Étape 1 — Générer le paquet Android avec PWABuilder

1. Va sur **https://www.pwabuilder.com**
2. Saisis l'URL : `https://anasabdirahman98-bot.github.io/Ground-app/`
3. PWABuilder analyse le manifest (icônes 192/512 + maskable déjà en place ✅) → clique **Package For Stores** → **Android → Google Play**.
4. Renseigne :
   - **Package ID** : `dj.ground.app` (doit être unique sur le Play Store, non modifiable après publication)
   - **App name** : `GROUND`
   - **Launcher name** : `GROUND`
   - **Host** : `anasabdirahman98-bot.github.io`
   - **Start URL** : `/Ground-app/`
5. Télécharge le `.zip`. Il contient :
   - `app-release-signed.aab` → c'est ce qu'on uploade sur le Play Store
   - `signing.keystore` + `signing-key-info.txt` → **À CONSERVER PRÉCIEUSEMENT** (clé de signature : sans elle, plus aucune mise à jour de l'app n'est possible)
   - `assetlinks.json` → contient déjà le bon SHA-256, voir étape 3

> 💡 Alternative : laisser **Google Play App Signing** gérer la clé (recommandé).
> Dans ce cas le SHA-256 à mettre dans `assetlinks.json` est celui affiché dans
> Play Console → *Configuration → Intégrité de l'app → Certificat de la clé de signature de l'app*.

---

## Étape 2 — Créer l'app dans la Play Console

1. https://play.google.com/console → **Créer une application**
2. Nom : `GROUND`, langue : français, type : Application, gratuite.
3. Remplis les sections obligatoires : description, captures d'écran (au moins 2),
   icône 512×512 (utilise `icons/icon-512.png` de ce repo), bannière 1024×500,
   politique de confidentialité (URL obligatoire), classification du contenu,
   public cible.
4. Crée une release (Test interne d'abord, c'est le plus simple) → **uploade le `.aab`**.

---

## Étape 3 — Héberger `assetlinks.json` (LE point délicat)

Le TWA vérifie que tu possèdes bien le domaine en lisant :

```
https://anasabdirahman98-bot.github.io/.well-known/assetlinks.json
```

⚠️ **À la racine du domaine** — PAS sous `/Ground-app/`. Sans ce fichier valide,
l'app s'ouvre **avec une barre d'URL Chrome** (mode "Custom Tab") au lieu du plein écran.

Comme GROUND est servi sur un *project page* (`/Ground-app/`), la racine
`anasabdirahman98-bot.github.io` dépend d'un **autre dépôt**. Deux solutions :

### Solution A — Dépôt de pages racine (recommandée, gratuite)
1. Crée un dépôt public nommé **exactement** `anasabdirahman98-bot.github.io`.
2. Dedans, crée le fichier `.well-known/assetlinks.json` avec le contenu fourni
   par PWABuilder (ou le template `android/.well-known/assetlinks.json` de ce repo,
   après avoir remplacé le SHA-256).
3. Active GitHub Pages sur ce dépôt (branche `main`).
4. Vérifie : `https://anasabdirahman98-bot.github.io/.well-known/assetlinks.json`
   doit renvoyer le JSON.

### Solution B — Domaine personnalisé
Si tu achètes un domaine (ex. `ground.dj`) et le pointes sur GitHub Pages,
l'appli est servie à la racine et `assetlinks.json` se met simplement dans
`.well-known/` de CE dépôt. Pense alors à mettre à jour `start_url`/`scope`
dans `manifest.json` et le `Host` dans PWABuilder.

---

## Étape 4 — Renseigner le bon SHA-256

Récupère l'empreinte SHA-256 :
- **Play App Signing** : Play Console → Configuration → Intégrité de l'app → copier le SHA-256, **ou**
- **Clé locale** : `keytool -list -v -keystore signing.keystore` → ligne `SHA256:`

Colle-la dans `assetlinks.json` à la place de `REMPLACER_PAR_LE_SHA256_DE_LA_CLE_DE_SIGNATURE`,
puis redéploie le fichier. Vérification officielle :
https://developers.google.com/digital-asset-links/tools/generator

---

## Étape 5 — Tester puis publier

1. Installe la release de **test interne** sur ton téléphone via le lien d'opt-in
   fourni par la Play Console.
2. Vérifie que l'app s'ouvre **en plein écran sans barre d'URL** (= assetlinks OK).
3. Quand tout est bon → promeus la release en **Production**.
4. Validation Google : généralement quelques heures à quelques jours.

---

## Récap des fichiers de ce repo utiles

- `manifest.json` — manifest PWA (icônes + start_url corrigés ✅)
- `icons/icon-192.png`, `icon-512.png` — icônes standard
- `icons/icon-maskable-192.png`, `icon-maskable-512.png` — icônes adaptatives Android
- `android/.well-known/assetlinks.json` — **template** (remplacer le SHA-256 + héberger à la racine du domaine)
