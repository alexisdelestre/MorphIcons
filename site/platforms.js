// site/platforms.js — content of the "Intégration" tab, one entry per platform.
// The code shown is fetched from the repo files themselves (`files`), so the
// page can never drift from what devs actually copy.

const JSON_FILE = {
  path: 'morph-icons.json',
  as: 'morph-icons.json',
  lang: 'json',
  note: 'Les données des pictos (version publiée). C’est le seul fichier à remplacer quand les designers publient une nouvelle version.',
};

const UPDATE_HTML = `
<ol>
  <li>Les designers publient une nouvelle version : le numéro de version (<code>"version"</code>) en tête du JSON augmente.</li>
  <li>Remplacez <code>morph-icons.json</code> dans l’app par la nouvelle version (bouton « Télécharger » ci-dessus).</li>
  <li>C’est tout : aucun code à toucher. Si un picto a été renommé ou supprimé, le compilateur ou une erreur explicite au lancement vous le signale.</li>
</ol>
<p>Le moteur, lui, ne change quasiment jamais. S’il change, c’est annoncé et les fichiers de code sont à remplacer aussi.</p>`;

export const PLATFORMS = [
  {
    id: 'react',
    label: 'React',
    sections: [
      {
        title: '1. Copier les fichiers',
        html: '<p>Mettez les 3 fichiers dans un même dossier, par exemple <code>src/components/morph-icon/</code>. Aucune dépendance à installer.</p>',
        files: [
          { path: 'platforms/react/MorphIcon.tsx', as: 'MorphIcon.tsx', lang: 'typescript' },
          { path: 'core/morph-core.ts', as: 'morph-core.ts', lang: 'typescript', note: 'Le moteur, identique pour React et React Native.' },
          JSON_FILE,
        ],
        after: '<p>Prérequis : React 17+, TypeScript avec <code>"resolveJsonModule": true</code> (activé par défaut avec Vite, Next.js, CRA).</p>',
      },
      {
        title: '2. Utiliser',
        lang: 'tsx',
        code: `
import { useState } from 'react';
import MorphIcon from './components/morph-icon/MorphIcon';

export function MenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(!open)} aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}>
      <MorphIcon name={open ? 'cross' : 'menu'} />
    </button>
  );
}`,
        after: `
<p>Changer <code>name</code> lance la transition. Un nouveau changement en cours de route repart de ce qui est affiché, sans saut.</p>
<table>
  <thead><tr><th>Prop</th><th>Type</th><th>Défaut</th><th></th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td><code>MorphIconName</code></td><td>—</td><td>Nom du picto. Le type est déduit du JSON : l’autocomplétion suit les ajouts des designers.</td></tr>
    <tr><td><code>size</code></td><td><code>number | string</code></td><td><code>24</code></td><td>Largeur et hauteur.</td></tr>
    <tr><td><code>duration</code></td><td><code>number</code> (ms)</td><td>valeur du JSON</td><td><code>0</code> = sans animation.</td></tr>
    <tr><td><code>strokeWidth</code></td><td><code>number</code></td><td>valeur du JSON</td><td>En unités de la grille de 24.</td></tr>
    <tr><td><code>title</code></td><td><code>string</code></td><td>—</td><td>Libellé accessible. Sans lui, le picto est décoratif (<code>aria-hidden</code>).</td></tr>
    <tr><td><code>className</code>, <code>style</code>…</td><td>props SVG</td><td></td><td>Transmises au <code>&lt;svg&gt;</code>.</td></tr>
  </tbody>
</table>
<p>La couleur est <code>currentColor</code> : réglez-la avec la propriété CSS <code>color</code>. Le réglage système « réduire les animations » est respecté. Compatible SSR : le premier rendu affiche directement le picto.</p>`,
      },
      { title: '3. Mettre à jour les pictos', html: UPDATE_HTML },
    ],
  },
  {
    id: 'react-native',
    label: 'React Native',
    sections: [
      {
        title: '1. Installer react-native-svg',
        lang: 'bash',
        code: `
# Expo
npx expo install react-native-svg

# React Native CLI
npm install react-native-svg
cd ios && pod install`,
      },
      {
        title: '2. Copier les fichiers',
        html: '<p>Les 3 fichiers dans un même dossier, par exemple <code>src/components/morph-icon/</code>. Metro importe le JSON nativement.</p>',
        files: [
          { path: 'platforms/react-native/MorphIcon.tsx', as: 'MorphIcon.tsx', lang: 'typescript' },
          { path: 'core/morph-core.ts', as: 'morph-core.ts', lang: 'typescript', note: 'Le moteur, identique pour React et React Native.' },
          JSON_FILE,
        ],
      },
      {
        title: '3. Utiliser',
        lang: 'tsx',
        code: `
import { useState } from 'react';
import { Pressable } from 'react-native';
import MorphIcon from './components/morph-icon/MorphIcon';

export function MenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen(!open)}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Fermer le menu' : 'Ouvrir le menu'}
      hitSlop={10}
    >
      <MorphIcon name={open ? 'cross' : 'menu'} color="#111" />
    </Pressable>
  );
}`,
        after: `
<table>
  <thead><tr><th>Prop</th><th>Type</th><th>Défaut</th><th></th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td><code>MorphIconName</code></td><td>—</td><td>Nom du picto, typé depuis le JSON.</td></tr>
    <tr><td><code>size</code></td><td><code>number</code></td><td><code>24</code></td><td>En dp.</td></tr>
    <tr><td><code>color</code></td><td><code>string</code></td><td><code>'#000'</code></td><td>Couleur du trait.</td></tr>
    <tr><td><code>duration</code></td><td><code>number</code> (ms)</td><td>valeur du JSON</td><td><code>0</code> = sans animation.</td></tr>
    <tr><td><code>strokeWidth</code></td><td><code>number</code></td><td>valeur du JSON</td><td>En unités de la grille de 24.</td></tr>
    <tr><td><code>style</code></td><td><code>ViewStyle</code></td><td></td><td></td></tr>
  </tbody>
</table>
<p>Le réglage « Réduire les animations » d’iOS / Android est respecté.</p>`,
      },
      { title: '4. Mettre à jour les pictos', html: UPDATE_HTML },
    ],
  },
  {
    id: 'swiftui',
    label: 'SwiftUI',
    sections: [
      {
        title: '1. Ajouter les fichiers au projet Xcode',
        html: `<p>Glissez les 3 fichiers dans le projet et cochez votre target. Vérifiez que <code>morph-icons.json</code> apparaît bien dans <b>Build Phases › Copy Bundle Resources</b>. iOS 15+ / macOS 12+, aucune dépendance.</p>`,
        files: [
          { path: 'platforms/swiftui/MorphIcon.swift', as: 'MorphIcon.swift', lang: 'swift' },
          { path: 'platforms/swiftui/MorphCore.swift', as: 'MorphCore.swift', lang: 'swift', note: 'Le moteur (Foundation seulement).' },
          JSON_FILE,
        ],
      },
      {
        title: '2. Utiliser',
        lang: 'swift',
        code: `
struct MenuButton: View {
    @State private var open = false

    var body: some View {
        Button { open.toggle() } label: {
            MorphIcon(open ? "cross" : "menu")
        }
        .foregroundStyle(.primary)
        .accessibilityLabel(open ? "Fermer le menu" : "Ouvrir le menu")
    }
}`,
        after: `
<table>
  <thead><tr><th>Paramètre</th><th>Type</th><th>Défaut</th><th></th></tr></thead>
  <tbody>
    <tr><td><code>_ name</code></td><td><code>String</code></td><td>—</td><td>Nom du picto. Changer la valeur lance la transition.</td></tr>
    <tr><td><code>size</code></td><td><code>CGFloat</code></td><td><code>24</code></td><td>En points.</td></tr>
    <tr><td><code>duration</code></td><td><code>Double?</code> (s)</td><td>valeur du JSON</td><td><code>0</code> = sans animation.</td></tr>
    <tr><td><code>data</code></td><td><code>MorphData</code></td><td><code>.shared</code></td><td>Chargé depuis <code>morph-icons.json</code> du bundle.</td></tr>
  </tbody>
</table>
<p>La couleur suit <code>.foregroundStyle()</code> / <code>.foregroundColor()</code>. « Réduire les animations » est respecté.</p>`,
      },
      { title: '3. Mettre à jour les pictos', html: UPDATE_HTML },
    ],
  },
  {
    id: 'compose',
    label: 'Jetpack Compose',
    sections: [
      {
        title: '1. Copier les fichiers',
        html: `<ul>
  <li><code>MorphCore.kt</code> et <code>MorphIcon.kt</code> dans votre code source. <b>Remplacez la ligne <code>package com.example.morphicons</code></b> par votre package, dans les deux fichiers.</li>
  <li><code>morph-icons.json</code> dans <code>app/src/main/assets/</code> (créez le dossier s’il n’existe pas).</li>
</ul>
<p>Dépendances : Compose UI et Material 3 (pour la couleur par défaut <code>LocalContentColor</code>). Le JSON est lu avec <code>org.json</code>, inclus dans Android.</p>`,
        files: [
          { path: 'platforms/compose/MorphIcon.kt', as: 'MorphIcon.kt', lang: 'kotlin' },
          { path: 'platforms/compose/MorphCore.kt', as: 'MorphCore.kt', lang: 'kotlin', note: 'Le moteur (Kotlin + org.json, sans Compose).' },
          JSON_FILE,
        ],
      },
      {
        title: '2. Utiliser',
        lang: 'kotlin',
        code: `
@Composable
fun MenuButton() {
    var open by remember { mutableStateOf(false) }
    IconButton(
        onClick = { open = !open },
        modifier = Modifier.semantics {
            contentDescription = if (open) "Fermer le menu" else "Ouvrir le menu"
        },
    ) {
        MorphIcon(if (open) "cross" else "menu")
    }
}`,
        after: `
<table>
  <thead><tr><th>Paramètre</th><th>Type</th><th>Défaut</th><th></th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td><code>String</code></td><td>—</td><td>Nom du picto. Changer la valeur lance la transition.</td></tr>
    <tr><td><code>modifier</code></td><td><code>Modifier</code></td><td><code>Modifier</code></td><td></td></tr>
    <tr><td><code>size</code></td><td><code>Dp</code></td><td><code>24.dp</code></td><td></td></tr>
    <tr><td><code>color</code></td><td><code>Color</code></td><td><code>LocalContentColor.current</code></td><td>Suit automatiquement la couleur d’un <code>IconButton</code>.</td></tr>
    <tr><td><code>durationMillis</code></td><td><code>Int?</code></td><td>valeur du JSON</td><td><code>0</code> = sans animation.</td></tr>
    <tr><td><code>data</code></td><td><code>MorphData</code></td><td><code>rememberMorphData()</code></td><td>Lu une seule fois depuis les assets.</td></tr>
  </tbody>
</table>
<p>L’échelle d’animation du système (Options développeur, « Supprimer les animations ») est respectée.</p>`,
      },
      { title: '3. Mettre à jour les pictos', html: UPDATE_HTML },
    ],
  },
  {
    id: 'flutter',
    label: 'Flutter',
    sections: [
      {
        title: '1. Copier les fichiers',
        html: '<p><code>morph_core.dart</code> et <code>morph_icon.dart</code> dans <code>lib/morph_icon/</code>, <code>morph-icons.json</code> dans <code>assets/</code>. Dart 3 requis, aucun package.</p>',
        files: [
          { path: 'platforms/flutter/morph_icon.dart', as: 'morph_icon.dart', lang: 'dart' },
          { path: 'platforms/flutter/morph_core.dart', as: 'morph_core.dart', lang: 'dart', note: 'Le moteur (Dart pur).' },
          JSON_FILE,
        ],
      },
      {
        title: '2. Déclarer l’asset et charger les données',
        lang: 'yaml',
        code: `
# pubspec.yaml
flutter:
  assets:
    - assets/morph-icons.json`,
        after: '<p>Puis chargez les données une fois, au démarrage :</p>',
      },
      {
        title: '',
        lang: 'dart',
        code: `
import 'package:flutter/widgets.dart';
import 'morph_icon/morph_icon.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await MorphIconData.load();
  runApp(const MyApp());
}`,
      },
      {
        title: '3. Utiliser',
        lang: 'dart',
        code: `
class MenuButton extends StatefulWidget {
  const MenuButton({super.key});
  @override
  State<MenuButton> createState() => _MenuButtonState();
}

class _MenuButtonState extends State<MenuButton> {
  bool open = false;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: open ? 'Fermer le menu' : 'Ouvrir le menu',
      onPressed: () => setState(() => open = !open),
      icon: MorphIcon(open ? 'cross' : 'menu'),
    );
  }
}`,
        after: `
<table>
  <thead><tr><th>Paramètre</th><th>Type</th><th>Défaut</th><th></th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td><code>String</code></td><td>—</td><td>Nom du picto. Changer la valeur lance la transition.</td></tr>
    <tr><td><code>size</code></td><td><code>double</code></td><td><code>24</code></td><td></td></tr>
    <tr><td><code>color</code></td><td><code>Color?</code></td><td>couleur de l’<code>IconTheme</code></td><td>Suit automatiquement la couleur d’un <code>IconButton</code>.</td></tr>
    <tr><td><code>duration</code></td><td><code>Duration?</code></td><td>valeur du JSON</td><td><code>Duration.zero</code> = sans animation.</td></tr>
    <tr><td><code>data</code></td><td><code>MorphData?</code></td><td><code>MorphIconData.instance</code></td><td></td></tr>
  </tbody>
</table>
<p>« Réduire les animations » (<code>MediaQuery.disableAnimations</code>) est respecté.</p>`,
      },
      { title: '4. Mettre à jour les pictos', html: UPDATE_HTML },
    ],
  },
];
