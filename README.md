# Morph Icons

Des pictos à 3 lignes qui se transforment les uns en les autres : n'importe quel picto vers n'importe quel autre. La même source de données sert au web et au mobile : **React, React Native, SwiftUI, Jetpack Compose et Flutter**.

**[→ Démo, éditeur et guide d'intégration](https://alexisdelestre.github.io/MorphIcons/)**

```tsx
<MorphIcon name={open ? 'cross' : 'menu'} />
```

Changez le nom, le picto s'anime vers le nouveau.

## Principe

- **3 lignes par picto, toujours.** Les pictos sont dessinés sur une grille de 24, avec un trait de 2 et des bouts arrondis, dans l'esprit de [Phosphor](https://phosphoricons.com). Comme ils ont tous la même structure, chaque transition consiste à faire glisser 3 lignes.
- **Moins de 3 traits ?** Les lignes en trop deviennent un point invisible au centre. Pendant une transition, elles en sortent ou s'y résorbent en s'effaçant.
- **Même forme, autre angle : rotation.** Les flèches, les chevrons, plus/croix et télécharger/envoyer forment des groupes de rotation. Entre deux membres d'un groupe, la forme tourne par le plus court chemin au lieu de se déformer.
- **Appariement automatique.** Pour les autres paires, le moteur choisit quelle ligne devient laquelle (ordre et sens) en minimisant la distance parcourue par les points. Quand l'œil n'est pas d'accord, une correction manuelle impose l'appariement pour une paire précise.
- **Dans les apps :** les transitions sont interruptibles, la courbe d'animation est identique sur toutes les plateformes, et le réglage système « réduire les animations » est respecté.

## Intégration

Le moteur s'intègre **une fois** par app ; les pictos vivent dans **`morph-icons.json`**, identique pour toutes les plateformes. Mettre à jour les pictos revient à remplacer ce fichier, sans toucher au code.

| Plateforme | Fichiers à copier | Prérequis |
|---|---|---|
| React | `platforms/react/MorphIcon.tsx`, `core/morph-core.ts` | React 17+, TypeScript |
| React Native | `platforms/react-native/MorphIcon.tsx`, `core/morph-core.ts` | `react-native-svg` |
| SwiftUI | `platforms/swiftui/MorphIcon.swift`, `MorphCore.swift` | iOS 15+ / macOS 12+ |
| Jetpack Compose | `platforms/compose/MorphIcon.kt`, `MorphCore.kt` | Compose, Material 3 |
| Flutter | `platforms/flutter/morph_icon.dart`, `morph_core.dart` | Dart 3 |

…plus `morph-icons.json` dans chaque cas. Les instructions pas à pas, les exemples et la liste des paramètres sont dans l'**[onglet Intégration de la démo](https://alexisdelestre.github.io/MorphIcons/#integration)**.

## Pictos disponibles

`menu` · `arrow-right` `arrow-down` `arrow-left` `arrow-up` · `chevron-right` `chevron-down` `chevron-left` `chevron-up` · `plus` `cross` · `download` `upload` · `minus` · `equals` · `asterisk` · `more` · `check` · `play` · `pause` · `external`

## Format des données

```jsonc
{
  "version": 1,
  "viewBox": 24,
  "strokeWidth": 2,
  "duration": 450,
  "groups": {
    // Un groupe = une forme ; ses membres ne diffèrent que par la rotation.
    "chevron": [null, [15, 12, 9, 5], [15, 12, 9, 19]]
  },
  "icons": {
    // Une ligne = [x1, y1, x2, y2], ou null pour une ligne inutilisée.
    "menu": { "lines": [[4, 7, 20, 7], [4, 12, 20, 12], [4, 17, 20, 17]] },
    "chevron-down": { "group": "chevron", "rotation": 90 }
  },
  "overrides": {
    // Facultatif : impose quelle ligne de départ devient quelle ligne d'arrivée
    // (vaut aussi pour la transition inverse).
    "menu>check": { "map": [2, 0, 1], "flip": [false, true, false] }
  }
}
```

## Contribuer

**Ajouter ou corriger un picto :** l'[éditeur de la démo](https://alexisdelestre.github.io/MorphIcons/#editor) permet de dessiner, de tester toutes les transitions et de corriger un appariement. Il exporte ensuite un `morph-icons.json`, à proposer en pull request. Le fichier compte un picto par ligne, pour des diffs lisibles.

**Modifier le moteur :** `core/morph-core.ts` est l'implémentation de référence. Les versions Swift, Kotlin et Dart en sont des traductions ligne à ligne. Chaque version doit reproduire les 420 transitions de `conformance/fixtures.json`, générées par la référence.

```bash
npm test             # tests de la référence ; vérifie que les fichiers générés sont à jour
npm run build        # régénère dist/ et les fixtures après une modification du moteur
npm run typecheck    # React + React Native (après: npm install --legacy-peer-deps --ignore-scripts)
npm run serve        # la démo en local sur http://localhost:8934
```

Le CI vérifie tout à chaque push : tests, typecheck, et conformité des versions Swift, Kotlin et Dart. Les commandes de chaque vérification sont dans [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

La démo doit être servie en HTTP : ouvrir `index.html` directement ne fonctionne pas. Sur macOS, un double-clic sur `Ouvrir la page.command` lance le serveur et ouvre le navigateur.

## Structure du dépôt

| Chemin | Contenu |
|---|---|
| `morph-icons.json` | Les pictos : la source de vérité |
| `core/` | Moteur de référence (TypeScript, sans dépendance) |
| `platforms/` | Composants React, React Native, SwiftUI, Jetpack Compose, Flutter |
| `conformance/` | Résultats attendus et vérificateurs pour Swift, Kotlin, Dart |
| `tests/`, `scripts/` | Tests, build, typecheck |
| `index.html`, `site/` | La démo (playground, éditeur, docs) |
| `dist/` | Fichiers générés, ne pas modifier |
| `archive-v1/` | Premier prototype, web uniquement |

## Crédits

Approche inspirée de l'article [*Morphing icons with Claude*](https://benji.org/morphing-icons-with-claude) (benji.org). Pictos dessinés dans l'esprit de [Phosphor Icons](https://phosphoricons.com).
