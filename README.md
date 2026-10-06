# Morph Icons

Des pictos à 3 lignes où n'importe quel picto se transforme en n'importe quel autre, sur **React, React Native, SwiftUI, Jetpack Compose et Flutter**, à partir d'un seul fichier de données partagé.

**La page** (playground, éditeur, docs d'intégration) est publiée par GitHub Pages depuis ce dépôt : voir `index.html`.

## Organisation

| | Quoi | Qui | Change |
|---|---|---|---|
| `morph-icons.json` | Tous les pictos (3 lignes chacun), groupes de rotation, corrections manuelles | Designers, via l'éditeur de la page | Souvent |
| `core/morph-core.ts` | Moteur de référence (TypeScript), partagé par React et React Native | Devs | Rarement |
| `platforms/*` | Composants : `react/`, `react-native/`, `swiftui/`, `compose/`, `flutter/` | Devs, intégré une fois par app | Rarement |
| `conformance/` | Résultats attendus (420 transitions) + vérificateur pour chaque portage | — | Quand le moteur change |
| `index.html`, `site/` | Le site GitHub Pages | — | — |
| `dist/` | Généré (`node scripts/build.mjs`), ne pas modifier | — | — |

Les apps embarquent `morph-icons.json`. Mettre à jour les pictos = remplacer ce fichier, sans toucher au code.

## Règles du moteur

1. Chaque picto = exactement 3 lignes dans une grille de 24. Dans le JSON, une ligne est `[x1, y1, x2, y2]`, ou `null` (ligne inutilisée, qui devient un point invisible au centre).
2. Les pictos qui sont la même forme à un autre angle partagent un **groupe**. Entre eux, la forme **tourne** (par le plus court chemin), sans morph de coordonnées.
3. Sinon, les coordonnées sont interpolées. Quelle ligne va où : l'**appariement automatique au trajet minimal** (6 ordres × 8 sens), sauf si `overrides["a>b"]` l'impose (valable aussi pour `b>a`, inversé).
4. Courbe easeInOutCubic partout. Interruptible : une nouvelle cible en cours de route repart de ce qui est affiché.

## Ouvrir la page en local

Double-cliquez sur **`Ouvrir la page.command`** (macOS) : il lance un petit serveur local et ouvre le navigateur. Fermez la fenêtre du Terminal pour l'arrêter. Ne pas ouvrir `index.html` directement : le navigateur bloque alors le chargement des pictos (la page l'explique si c'est le cas).

## Développer

```bash
npm run serve      # page sur http://localhost:8934 (il faut du HTTP, pas file://)
npm test           # tests de la référence + vérifie que dist/ et les fixtures sont à jour
npm run build      # après une modification de core/morph-core.ts
npm install --legacy-peer-deps --ignore-scripts && npm run typecheck   # typecheck React + React Native
```

Une modification du moteur se fait dans `core/morph-core.ts`, puis se reporte dans `platforms/swiftui/MorphCore.swift`, `platforms/compose/MorphCore.kt` et `platforms/flutter/morph_core.dart`. Lancez ensuite `npm run build`, puis la vérification de conformité de chaque portage (commandes dans `.github/workflows/ci.yml` ; le CI les lance toutes).

## Publier (GitHub Pages)

Settings › Pages › Deploy from a branch › `main` / `(root)`. Le fichier `.nojekyll` fait servir les fichiers tels quels.

`archive-v1/` : le premier prototype (web uniquement), gardé pour référence. Il peut être supprimé.
