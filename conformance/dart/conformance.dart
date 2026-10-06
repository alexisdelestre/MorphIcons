// Dart conformance runner for platforms/flutter/morph_core.dart.
// Run from the repo root (pure Dart, no Flutter needed):
//
//   dart run conformance/dart/conformance.dart conformance/fixtures.json
//
// Runs the same checks as the fixture test in tests/core.test.ts: ease and
// shortestDelta samples, every transition (plan kind; map / flip / source for
// morphs; frames at sampled t), and interruption chains (plan from->via,
// stateAt(cut), then plan to `to`). Exits with code 1 on any mismatch.

import 'dart:convert';
import 'dart:io';

import '../../platforms/flutter/morph_core.dart';

double _d(Object? v) => (v as num).toDouble();

void main(List<String> args) {
  final String path = args.isNotEmpty ? args[0] : 'conformance/fixtures.json';
  final Map<String, dynamic> fx = jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
  final double tol = _d(fx['tolerance']);
  final MorphData data = MorphData.fromJson(fx['data'] as Map<String, dynamic>);
  final List<String> failures = <String>[];

  bool near(double got, double want) => (got - want).abs() <= tol;

  void sameFrame(MorphFrame got, Map<String, dynamic> want, String label) {
    final double wantRotation = _d(want['rotation']);
    if (!near(got.rotation, wantRotation)) {
      failures.add('$label: rotation ${got.rotation} != $wantRotation');
    }
    final List<dynamic> wantLines = want['lines'] as List<dynamic>;
    if (got.lines.length != 3) {
      failures.add('$label: ${got.lines.length} lines, 3 expected');
      return;
    }
    for (int k = 0; k < 3; k++) {
      final Seg s = got.lines[k];
      final List<double> gotValues = <double>[s.x1, s.y1, s.x2, s.y2, s.o];
      final List<dynamic> w = wantLines[k] as List<dynamic>;
      for (int i = 0; i < 5; i++) {
        if (!near(gotValues[i], _d(w[i]))) {
          failures.add('$label: line $k got $gotValues, want $w');
          break;
        }
      }
    }
  }

  // ---- ease ----
  for (final dynamic row in fx['ease'] as List<dynamic>) {
    final List<dynamic> r = row as List<dynamic>;
    final double t = _d(r[0]);
    final double want = _d(r[1]);
    final double got = ease(t);
    if (!near(got, want)) failures.add('ease($t) = $got, want $want');
  }

  // ---- shortestDelta ----
  for (final dynamic row in fx['shortestDelta'] as List<dynamic>) {
    final List<dynamic> r = row as List<dynamic>;
    final double a = _d(r[0]);
    final double b = _d(r[1]);
    final double want = _d(r[2]);
    final double got = shortestDelta(a, b);
    if (!near(got, want)) failures.add('shortestDelta($a, $b) = $got, want $want');
  }

  // ---- transitions ----
  final List<dynamic> transitions = fx['transitions'] as List<dynamic>;
  for (final dynamic item in transitions) {
    final Map<String, dynamic> tr = item as Map<String, dynamic>;
    final String from = tr['from'] as String;
    final String to = tr['to'] as String;
    final String label = '$from->$to';
    try {
      final MorphPlan p = plan(data, restState(data, from), to);
      final String wantKind = tr['kind'] as String;
      if (p.kind != wantKind) failures.add('$label: kind ${p.kind}, want $wantKind');
      if (p is MorphLinesPlan) {
        final List<int> wantMap = <int>[
          for (final dynamic n in tr['map'] as List<dynamic>) (n as num).toInt(),
        ];
        final List<bool> wantFlip = <bool>[
          for (final dynamic f in tr['flip'] as List<dynamic>) f as bool,
        ];
        if (!_sameList<int>(p.map, wantMap)) failures.add('$label: map ${p.map}, want $wantMap');
        if (!_sameList<bool>(p.flip, wantFlip)) failures.add('$label: flip ${p.flip}, want $wantFlip');
        final String wantSource = tr['source'] as String;
        if (p.source != wantSource) failures.add('$label: source ${p.source}, want $wantSource');
      }
      for (final dynamic f in tr['frames'] as List<dynamic>) {
        final Map<String, dynamic> frame = f as Map<String, dynamic>;
        final double t = _d(frame['t']);
        sameFrame(frameAt(p, t), frame, '$label@$t');
      }
    } catch (e) {
      failures.add('$label: threw $e');
    }
  }

  // ---- interruption chains ----
  final List<dynamic> chains = fx['chains'] as List<dynamic>;
  for (final dynamic item in chains) {
    final Map<String, dynamic> ch = item as Map<String, dynamic>;
    final String from = ch['from'] as String;
    final String via = ch['via'] as String;
    final String to = ch['to'] as String;
    final String label = 'chain $from>$via>$to';
    try {
      final MorphState mid = stateAt(plan(data, restState(data, from), via), _d(ch['cut']));
      final MorphPlan p = plan(data, mid, to);
      final String wantKind = ch['kind'] as String;
      if (p.kind != wantKind) failures.add('$label: kind ${p.kind}, want $wantKind');
      for (final dynamic f in ch['frames'] as List<dynamic>) {
        final Map<String, dynamic> frame = f as Map<String, dynamic>;
        final double t = _d(frame['t']);
        sameFrame(frameAt(p, t), frame, '$label@$t');
      }
    } catch (e) {
      failures.add('$label: threw $e');
    }
  }

  if (failures.isEmpty) {
    print('Dart conformance: ${transitions.length} transitions, ${chains.length} chains — OK');
    return;
  }
  print('Dart conformance: ${failures.length} failure(s)');
  for (final String failure in failures.take(20)) {
    print('  $failure');
  }
  if (failures.length > 20) print('  ... and ${failures.length - 20} more');
  exit(1);
}

bool _sameList<T>(List<T> a, List<T> b) {
  if (a.length != b.length) return false;
  for (int i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
