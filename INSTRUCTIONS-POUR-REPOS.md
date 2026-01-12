# Instructions pour ajouter cea-app.json dans vos repos

Ce document explique comment intégrer votre application au CEA App Store en ajoutant un fichier `cea-app.json` dans votre repository.

---

## 🎯 Objectif

Ajouter un fichier `cea-app.json` à la racine de votre repository pour permettre au CEA App Store de :
- Récupérer automatiquement les informations de votre app
- Détecter si l'app est installée sur le PC de l'utilisateur
- Afficher les bonnes métadonnées (nom, description, logo, version, etc.)

---

## 📋 Tâches à effectuer

### 1. Créer le fichier `cea-app.json` à la racine du repo

Placez le fichier **à la racine** de votre repository (même niveau que `package.json`, `README.md`, etc.)

```
votre-repo/
├── cea-app.json          ← ICI (nouveau fichier)
├── package.json
├── src/
├── build/
└── README.md
```

### 2. Remplir le template avec les informations de votre app

Utilisez le template ci-dessous et remplacez **toutes les valeurs entre `< >`** par les informations réelles de votre application.

---

## 📝 Template à copier-coller

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "version": "1.0.0",
  "app": {
    "id": "<ID_UNIQUE_KEBAB_CASE>",
    "name": "<NOM_AFFICHE_DE_LAPP>",
    "version": "<VERSION_ACTUELLE>",
    "description": {
      "short": "<DESCRIPTION_COURTE_MAX_100_CARACTERES>",
      "long": "<DESCRIPTION_DETAILLEE_COMPLETE>"
    }
  },
  "resources": {
    "logo": {
      "path": "build/icon.png",
      "url": "https://raw.githubusercontent.com/Matthmusic/<NOM_DU_REPO>/main/build/icon.png"
    },
    "icon": {
      "path": "build/icon.ico",
      "url": "https://raw.githubusercontent.com/Matthmusic/<NOM_DU_REPO>/main/build/icon.ico"
    }
  },
  "detection": {
    "windows": {
      "files": [
        {
          "path": "<CHEMIN_VERS_EXE_PRINCIPAL>",
          "description": "Fichier exécutable principal"
        }
      ],
      "directories": [
        {
          "path": "<CHEMIN_VERS_DOSSIER_APPDATA>",
          "description": "Dossier de données utilisateur"
        }
      ],
      "registry": [
        {
          "key": "<CLE_REGISTRE_WINDOWS>",
          "description": "Clé d'installation"
        }
      ]
    },
    "priority": "files"
  },
  "metadata": {
    "author": {
      "name": "Matthmusic",
      "url": "https://github.com/Matthmusic"
    },
    "category": "<CATEGORIE>",
    "tags": [
      "<TAG1>",
      "<TAG2>",
      "<TAG3>"
    ],
    "repository": {
      "type": "github",
      "url": "https://github.com/Matthmusic/<NOM_DU_REPO>",
      "branch": "main"
    },
    "license": "MIT",
    "compatibility": {
      "os": ["windows"],
      "minVersion": "Windows 10"
    }
  },
  "installation": {
    "type": "installer",
    "downloadUrl": "https://github.com/Matthmusic/<NOM_DU_REPO>/releases/latest/download/<NOM_INSTALLER>.exe"
  },
  "changelog": {
    "<VERSION_ACTUELLE>": {
      "date": "<DATE_AU_FORMAT_YYYY-MM-DD>",
      "changes": [
        "<CHANGEMENT_1>",
        "<CHANGEMENT_2>",
        "<CHANGEMENT_3>"
      ]
    }
  }
}
```

---

## 🔍 Guide de remplissage des champs

### Section `app`

| Champ | Description | Exemple |
|-------|-------------|---------|
| `id` | Identifiant unique en kebab-case | `"listx"`, `"todox"`, `"autonum"` |
| `name` | Nom affiché dans l'App Store | `"ListX"`, `"To-DoX"`, `"AUTONUM"` |
| `version` | Version actuelle (Semantic Versioning) | `"1.0.0"`, `"2.1.3"` |
| `description.short` | Description courte (max 100 caractères) | `"Génération de listings de documents"` |
| `description.long` | Description détaillée complète | `"ListX est une application professionnelle de..."` |

### Section `resources`

| Champ | Description | Exemple |
|-------|-------------|---------|
| `logo.path` | Chemin relatif vers le logo dans le repo | `"build/icon.png"` |
| `logo.url` | URL directe vers le logo sur GitHub | `"https://raw.githubusercontent.com/Matthmusic/ListX/main/build/icon.png"` |

**Important** : Remplacez `<NOM_DU_REPO>` par le nom exact de votre repository.

### Section `detection` ⚠️ **CRUCIAL**

C'est la section la plus importante ! Elle permet de détecter si votre app est installée.

#### Trouver les chemins de détection

**Pour les fichiers (`files`) :**
1. Installez votre app sur votre PC
2. Cherchez où se trouve le fichier `.exe` principal
3. Notez le chemin complet

Exemples courants :
- `"C:\\Program Files\\ListX\\ListX.exe"`
- `"C:\\Program Files (x86)\\MonApp\\MonApp.exe"`

**Pour les dossiers (`directories`) :**
Utilisez les variables d'environnement pour les données utilisateur :
- `"%APPDATA%\\ListX"` → `C:\Users\Username\AppData\Roaming\ListX`
- `"%LOCALAPPDATA%\\ListX"` → `C:\Users\Username\AppData\Local\ListX`

**Pour le registre Windows (`registry`) :**
Si votre installeur crée des clés de registre :
- `"HKEY_LOCAL_MACHINE\\SOFTWARE\\MonApp"`
- `"HKEY_CURRENT_USER\\SOFTWARE\\MonApp"`

**Ordre de priorité (`priority`) :**
- `"files"` : Vérifie d'abord les fichiers (recommandé)
- `"directories"` : Vérifie d'abord les dossiers
- `"registry"` : Vérifie d'abord le registre

### Section `metadata`

| Champ | Description | Valeurs possibles |
|-------|-------------|-------------------|
| `category` | Catégorie de l'app | `"Productivité"`, `"Utilitaires"`, `"Professionnel"`, `"Développement"` |
| `tags` | Mots-clés pour la recherche | `["productivite", "documents", "pdf"]` |

### Section `installation`

| Champ | Description | Exemple |
|-------|-------------|---------|
| `downloadUrl` | URL de téléchargement du setup | `"https://github.com/Matthmusic/ListX/releases/latest/download/ListX-Setup.exe"` |

**Important** : Utilisez `/releases/latest/download/` pour pointer vers la dernière version automatiquement.

### Section `changelog`

Ajoutez une entrée pour chaque version :

```json
"changelog": {
  "1.0.0": {
    "date": "2025-01-15",
    "changes": [
      "Version initiale",
      "Fonctionnalité principale implémentée"
    ]
  },
  "1.1.0": {
    "date": "2025-02-01",
    "changes": [
      "Ajout de la fonctionnalité X",
      "Correction de bugs"
    ]
  }
}
```

---

## ✅ Checklist avant de commit

Avant de commit votre `cea-app.json`, vérifiez :

- [ ] Le fichier est à la **racine du repository**
- [ ] Le JSON est **valide** (pas d'erreur de syntaxe)
- [ ] L'`id` est **unique** et en kebab-case
- [ ] La `version` suit le format **X.Y.Z**
- [ ] Les **URLs des ressources** (logo, icon) sont accessibles
- [ ] Les **chemins de détection** sont corrects (testez sur votre PC)
- [ ] L'URL de `downloadUrl` pointe vers le bon fichier setup
- [ ] Le **changelog** est à jour pour la version actuelle

---

## 🧪 Tester votre fichier

### 1. Valider le JSON

Utilisez un validateur JSON en ligne ou dans votre éditeur pour vérifier qu'il n'y a pas d'erreur de syntaxe.

### 2. Vérifier les URLs

Testez que les URLs sont accessibles :
- Logo : `https://raw.githubusercontent.com/Matthmusic/VOTRE_REPO/main/build/icon.png`
- Setup : `https://github.com/Matthmusic/VOTRE_REPO/releases/latest/download/...`

### 3. Tester la détection

Sur votre PC où l'app est installée :
1. Vérifiez que les chemins dans `detection.windows.files` existent
2. Vérifiez que les dossiers dans `detection.windows.directories` existent
3. Testez avec `dir "C:\Program Files\MonApp"` dans cmd

---

## 📦 Exemple complet : ListX

Voici un exemple complet pour référence :

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "version": "1.0.0",
  "app": {
    "id": "listx",
    "name": "ListX",
    "version": "1.0.0",
    "description": {
      "short": "Génération et gestion de listings de documents techniques",
      "long": "ListX est une application professionnelle de génération et gestion de listings de documents techniques. Elle permet de créer rapidement des inventaires de fichiers avec exports PDF et Excel, parfaite pour la documentation de projets industriels et techniques."
    }
  },
  "resources": {
    "logo": {
      "path": "build/icon.png",
      "url": "https://raw.githubusercontent.com/Matthmusic/ListX/main/build/icon.png"
    },
    "icon": {
      "path": "build/icon.ico",
      "url": "https://raw.githubusercontent.com/Matthmusic/ListX/main/build/icon.ico"
    }
  },
  "detection": {
    "windows": {
      "files": [
        {
          "path": "C:\\Program Files\\ListX\\ListX.exe",
          "description": "Installation standard 64-bit"
        }
      ],
      "directories": [
        {
          "path": "%APPDATA%\\ListX",
          "description": "Dossier de données utilisateur"
        }
      ]
    },
    "priority": "files"
  },
  "metadata": {
    "author": {
      "name": "Matthmusic",
      "url": "https://github.com/Matthmusic"
    },
    "category": "Productivité",
    "tags": ["productivite", "documents", "listing", "pdf", "excel"],
    "repository": {
      "type": "github",
      "url": "https://github.com/Matthmusic/ListX",
      "branch": "main"
    },
    "license": "MIT",
    "compatibility": {
      "os": ["windows"],
      "minVersion": "Windows 10"
    }
  },
  "installation": {
    "type": "installer",
    "downloadUrl": "https://github.com/Matthmusic/ListX/releases/latest/download/ListX-Setup.exe"
  },
  "changelog": {
    "1.0.0": {
      "date": "2025-01-01",
      "changes": [
        "Version initiale",
        "Génération de listings de documents",
        "Export PDF et Excel",
        "Interface utilisateur moderne"
      ]
    }
  }
}
```

---

## 🤖 Instructions pour l'IA de code

**Prompt à donner à ton IA :**

> Crée un fichier `cea-app.json` à la racine de ce repository en suivant le template du fichier `INSTRUCTIONS-POUR-REPOS.md`.
>
> Remplis toutes les informations spécifiques à cette application :
> - Trouve le nom de l'app et son ID
> - Écris une description courte et longue pertinente
> - Identifie où l'app s'installe (cherche dans le code de l'installeur ou electron-builder config)
> - Trouve le nom exact du fichier setup dans les releases GitHub
> - Mets à jour le changelog avec la version actuelle
>
> Assure-toi que :
> - Les chemins de détection sont corrects
> - Les URLs pointent vers ce repository
> - Le JSON est valide
> - Tous les champs obligatoires sont remplis

---

## 📞 Support

Si tu as des questions, consulte le [CEA-APP-GUIDE.md](CEA-APP-GUIDE.md) pour plus de détails sur chaque champ.

---

**Fait avec ❤️ pour le CEA App Store**
