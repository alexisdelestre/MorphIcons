// morph_core.dart — Morph Icons engine, Dart port of core/morph-core.ts.
// -----------------------------------------------------------------------------
// Pure Dart (dart:math + dart:convert only): no package:flutter import, so the
// conformance runner works with a plain `dart run`. The Flutter widget lives in
// morph_icon.dart.
//
// Ported line-for-line from the reference. Any behavior change must be made
// there first, then mirrored here and re-checked with
// conformance/dart/conformance.dart against conformance/fixtures.json.
//
// Everything is double (like JS numbers) so results match the fixtures. JSON
// numbers may decode as int or double: always read them as `num`, then
// `.toDouble()`.
// -----------------------------------------------------------------------------

import 'dart:convert';
import 'dart:math' as math;

// ---- Data model ----------------------------------------------------------------

/// One rendered line. `o` = opacity (0-1). Immutable, so sharing an instance
/// is as safe as the `{ ...s }` copies made by the reference.
class Seg {
  const Seg(this.x1, this.y1, this.x2, this.y2, this.o);

  final double x1;
  final double y1;
  final double x2;
  final double y2;
  final double o;

  @override
  String toString() => 'Seg($x1, $y1, $x2, $y2, o: $o)';
}

/// An icon in the JSON: either its own `lines`, or a `group` template plus a
/// `rotation` (degrees, clockwise).
class IconDef {
  const IconDef({this.lines, this.group, this.rotation});

  factory IconDef.fromJson(Map<String, dynamic> json) {
    final Object? lines = json['lines'];
    final Object? rotation = json['rotation'];
    return IconDef(
      lines: lines == null ? null : _rawLines(lines),
      group: json['group'] as String?,
      rotation: rotation == null ? null : (rotation as num).toDouble(),
    );
  }

  /// In the JSON a line is [x1, y1, x2, y2], or null for an unused line.
  final List<List<double>?>? lines;
  final String? group;
  final double? rotation;
}

/// A designer-forced line correspondence.
class MorphOverride {
  const MorphOverride({required this.map, required this.flip});

  factory MorphOverride.fromJson(Map<String, dynamic> json) {
    return MorphOverride(
      map: <int>[for (final dynamic n in json['map'] as List<dynamic>) (n as num).toInt()],
      flip: <bool>[for (final dynamic f in json['flip'] as List<dynamic>) f as bool],
    );
  }

  /// map[k] = index (0-2) of the target line that source line k morphs into.
  final List<int> map;

  /// flip[k] = true to connect source k's start to the target line's end.
  final List<bool> flip;
}

/// Result of the automatic matching: an override plus its total travel.
class MorphMatch extends MorphOverride {
  const MorphMatch({required super.map, required super.flip, required this.cost});

  final double cost;
}

class MorphData {
  const MorphData({
    required this.version,
    required this.viewBox,
    required this.strokeWidth,
    required this.duration,
    required this.groups,
    required this.icons,
    this.overrides,
  });

  factory MorphData.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> groupsJson = json['groups'] as Map<String, dynamic>;
    final Map<String, dynamic> iconsJson = json['icons'] as Map<String, dynamic>;
    final Object? overridesJson = json['overrides'];
    return MorphData(
      version: (json['version'] as num).toInt(),
      viewBox: (json['viewBox'] as num).toDouble(),
      strokeWidth: (json['strokeWidth'] as num).toDouble(),
      duration: (json['duration'] as num).toDouble(),
      groups: <String, List<List<double>?>>{
        for (final MapEntry<String, dynamic> e in groupsJson.entries) e.key: _rawLines(e.value),
      },
      icons: <String, IconDef>{
        for (final MapEntry<String, dynamic> e in iconsJson.entries)
          e.key: IconDef.fromJson(e.value as Map<String, dynamic>),
      },
      overrides: overridesJson == null ? null : _overrides(overridesJson as Map<String, dynamic>),
    );
  }

  /// Parses the content of morph-icons.json.
  static MorphData parse(String json) {
    return MorphData.fromJson(jsonDecode(json) as Map<String, dynamic>);
  }

  final int version;
  final double viewBox;
  final double strokeWidth;

  /// Default transition duration, in milliseconds.
  final double duration;
  final Map<String, List<List<double>?>> groups;
  final Map<String, IconDef> icons;

  /// Key "from>to". Also used in reverse (inverted) for "to>from".
  final Map<String, MorphOverride>? overrides;
}

List<double>? _rawLine(Object? value) {
  if (value == null) return null;
  return <double>[for (final dynamic n in value as List<dynamic>) (n as num).toDouble()];
}

List<List<double>?> _rawLines(Object? value) {
  return <List<double>?>[for (final dynamic l in value as List<dynamic>) _rawLine(l)];
}

Map<String, MorphOverride> _overrides(Map<String, dynamic> json) {
  return <String, MorphOverride>{
    for (final MapEntry<String, dynamic> e in json.entries)
      e.key: MorphOverride.fromJson(e.value as Map<String, dynamic>),
  };
}

/// What is on screen. If `group` is set, `lines` is the group's template (local
/// coordinates) and `rotation` applies to it. Otherwise `lines` are absolute
/// and `rotation` is 0. `name` is set only at rest on a known icon.
/// `lines` always has exactly 3 segments.
class MorphState {
  const MorphState({
    required this.name,
    required this.group,
    required this.lines,
    required this.rotation,
  });

  final String? name;
  final String? group;
  final List<Seg> lines;
  final double rotation;
}

/// Describes one transition. Use a `switch` on the subclasses (sealed, so the
/// compiler checks exhaustiveness).
sealed class MorphPlan {
  const MorphPlan(this.end);

  /// Resting state once the transition is over.
  final MorphState end;

  /// 'none' | 'rotate' | 'morph', as in the reference.
  String get kind;
}

/// Already there: nothing to animate.
class NonePlan extends MorphPlan {
  const NonePlan(super.end);

  @override
  String get kind => 'none';
}

/// Same group: rotate the template from `from` to `to` degrees.
class RotatePlan extends MorphPlan {
  const RotatePlan({
    required this.lines,
    required this.from,
    required this.to,
    required MorphState end,
  }) : super(end);

  final List<Seg> lines;
  final double from;
  final double to;

  @override
  String get kind => 'rotate';
}

/// Different shapes: interpolate absolute coordinates `from` -> `to`.
class MorphLinesPlan extends MorphPlan {
  const MorphLinesPlan({
    required this.from,
    required this.to,
    required this.map,
    required this.flip,
    required this.source,
    required MorphState end,
  }) : super(end);

  final List<Seg> from;

  /// Target lines already arranged (reordered / flipped) to line up with `from`.
  final List<Seg> to;
  final List<int> map;
  final List<bool> flip;

  /// 'auto' | 'override'.
  final String source;

  @override
  String get kind => 'morph';
}

/// What to draw: the 3 lines, rotated by `rotation` degrees around the center.
class MorphFrame {
  const MorphFrame({required this.lines, required this.rotation});

  final List<Seg> lines;
  final double rotation;
}

// ---- Constants shared by every port -----------------------------------------

/// Matching tolerance: a candidate replaces the current best only if it is
/// cheaper by more than this. Keeps float-level near-ties deterministic.
const double matchEpsilon = 1e-6;

/// Nudge applied to a visible zero-length line (a "dot") so every renderer
/// draws its round cap.
const double dotNudge = 0.01;

/// Enumeration order matters (ties go to the first candidate). Same order in every port.
const List<List<int>> permutations = <List<int>>[
  <int>[0, 1, 2],
  <int>[0, 2, 1],
  <int>[1, 0, 2],
  <int>[1, 2, 0],
  <int>[2, 0, 1],
  <int>[2, 1, 0],
];

// ---- Easing ---------------------------------------------------------------------

/// easeInOutCubic, clamped to [0, 1].
double ease(double t) {
  if (t <= 0) return 0.0;
  if (t >= 1) return 1.0;
  return t < 0.5 ? 4 * t * t * t : 1 - math.pow(-2 * t + 2, 3).toDouble() / 2;
}

double _lerp(double a, double b, double t) {
  return a + (b - a) * t;
}

// ---- Data -> lines -----------------------------------------------------------

Seg toSeg(List<double>? raw, double center) {
  if (raw == null) return Seg(center, center, center, center, 0.0);
  final double x1 = raw[0];
  final double y1 = raw[1];
  final double x2 = raw[2];
  final double y2 = raw[3];
  if (x1 == x2 && y1 == y2) return Seg(x1, y1, x2 + dotNudge, y2, 1.0);
  return Seg(x1, y1, x2, y2, 1.0);
}

List<Seg> _toLines(List<List<double>?> raw, double center) {
  return <Seg>[toSeg(raw[0], center), toSeg(raw[1], center), toSeg(raw[2], center)];
}

List<Seg> bake(List<Seg> lines, double rotation, double center) {
  // Seg is immutable: a new list holding the same segments is a full copy.
  if (rotation == 0.0) return <Seg>[lines[0], lines[1], lines[2]];
  final double r = (rotation * math.pi) / 180;
  final double cos = math.cos(r);
  final double sin = math.sin(r);
  Seg rot(Seg s) {
    final double dx1 = s.x1 - center;
    final double dy1 = s.y1 - center;
    final double dx2 = s.x2 - center;
    final double dy2 = s.y2 - center;
    return Seg(
      center + dx1 * cos - dy1 * sin,
      center + dx1 * sin + dy1 * cos,
      center + dx2 * cos - dy2 * sin,
      center + dx2 * sin + dy2 * cos,
      s.o,
    );
  }

  return <Seg>[rot(lines[0]), rot(lines[1]), rot(lines[2])];
}

/// The resting state of an icon (what a jump to `name` displays).
MorphState restState(MorphData data, String name) {
  final IconDef? def = data.icons[name];
  if (def == null) throw ArgumentError('Unknown icon "$name"');
  final double center = data.viewBox / 2;
  final double rotation = def.rotation ?? 0.0;
  final String? group = def.group;
  // `isNotEmpty` mirrors the reference's JS truthiness check on `def.group`.
  if (group != null && group.isNotEmpty) {
    final List<List<double>?>? tpl = data.groups[group];
    if (tpl == null) throw StateError('Icon "$name": unknown group "$group"');
    return MorphState(name: name, group: group, lines: _toLines(tpl, center), rotation: rotation);
  }
  final List<List<double>?>? lines = def.lines;
  if (lines == null) throw StateError('Icon "$name": needs "lines" or "group"');
  return MorphState(
    name: name,
    group: null,
    lines: bake(_toLines(lines, center), rotation, center),
    rotation: 0.0,
  );
}

MorphFrame frameOf(MorphState state) {
  return MorphFrame(lines: state.lines, rotation: state.rotation);
}

// ---- Rotation ---------------------------------------------------------------------

/// Signed delta in [-180, 180) to go from `from` to `to` the short way.
double shortestDelta(double from, double to) {
  // Dart's `%` is Euclidean (result always in [0, 360)) while JS's keeps the
  // dividend's sign (result in (-360, 360)). Both inner values are congruent
  // mod 360, and the +540 then the second `%` (applied to a positive number,
  // where both definitions agree) bring them to the same value in [0, 360).
  // So the result is identical to the reference; the fixtures include
  // negative cases ([270, 0], [-90, 450]) to verify it.
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// ---- Line matching -----------------------------------------------------------------

double _dist(double ax, double ay, double bx, double by) {
  final double dx = ax - bx;
  final double dy = ay - by;
  return math.sqrt(dx * dx + dy * dy); // not a hypot helper: identical to the other ports
}

/// Least-travel correspondence between the lines of `a` and `b` (absolute coordinates).
MorphMatch match(List<Seg> a, List<Seg> b) {
  double best = double.infinity;
  List<int> bestPerm = permutations[0];
  int bestMask = 0;
  for (final List<int> perm in permutations) {
    for (int mask = 0; mask < 8; mask++) {
      double cost = 0;
      for (int k = 0; k < 3; k++) {
        final Seg s = a[k];
        final Seg t = b[perm[k]];
        if (((mask >> k) & 1) != 0) {
          cost += _dist(s.x1, s.y1, t.x2, t.y2) + _dist(s.x2, s.y2, t.x1, t.y1);
        } else {
          cost += _dist(s.x1, s.y1, t.x1, t.y1) + _dist(s.x2, s.y2, t.x2, t.y2);
        }
      }
      if (cost < best - matchEpsilon) {
        best = cost;
        bestPerm = perm;
        bestMask = mask;
      }
    }
  }
  return MorphMatch(
    map: <int>[bestPerm[0], bestPerm[1], bestPerm[2]],
    flip: <bool>[(bestMask & 1) != 0, (bestMask & 2) != 0, (bestMask & 4) != 0],
    cost: best,
  );
}

/// Forced matching for from>to, or the inverse of to>from. null if none.
MorphOverride? overrideFor(MorphData data, String from, String to) {
  final Map<String, MorphOverride>? ov = data.overrides;
  if (ov == null) return null;
  final MorphOverride? direct = ov['$from>$to'];
  if (direct != null) {
    return MorphOverride(map: List<int>.of(direct.map), flip: List<bool>.of(direct.flip));
  }
  final MorphOverride? rev = ov['$to>$from'];
  if (rev == null) return null;
  final List<int> map = <int>[0, 0, 0];
  final List<bool> flip = <bool>[false, false, false];
  for (int k = 0; k < 3; k++) {
    map[rev.map[k]] = k;
    flip[rev.map[k]] = rev.flip[k];
  }
  return MorphOverride(map: map, flip: flip);
}

List<Seg> _arrange(List<Seg> b, List<int> map, List<bool> flip) {
  Seg pick(int k) {
    final Seg s = b[map[k]];
    return flip[k] ? Seg(s.x2, s.y2, s.x1, s.y1, s.o) : s;
  }

  return <Seg>[pick(0), pick(1), pick(2)];
}

// ---- Planning & sampling --------------------------------------------------------

/// Describes the transition from what's on screen (`from`) to icon `to`.
MorphPlan plan(MorphData data, MorphState from, String to) {
  final MorphState end = restState(data, to);
  if (from.name == to) return NonePlan(end);

  final String? fromGroup = from.group;
  if (fromGroup != null && fromGroup == end.group) {
    return RotatePlan(
      lines: from.lines,
      from: from.rotation,
      to: from.rotation + shortestDelta(from.rotation, end.rotation),
      end: end,
    );
  }

  final double center = data.viewBox / 2;
  final List<Seg> a = from.group != null ? bake(from.lines, from.rotation, center) : from.lines;
  final List<Seg> b = end.group != null ? bake(end.lines, end.rotation, center) : end.lines;
  final String? fromName = from.name;
  final MorphOverride? forced = fromName != null ? overrideFor(data, fromName, to) : null;
  final MorphOverride m = forced ?? match(a, b);
  return MorphLinesPlan(
    from: a,
    to: _arrange(b, m.map, m.flip),
    map: m.map,
    flip: m.flip,
    source: forced != null ? 'override' : 'auto',
    end: end,
  );
}

/// Frame to draw at linear progress t (0-1). Easing is applied here.
MorphFrame frameAt(MorphPlan p, double t) {
  final double e = ease(t);
  return switch (p) {
    NonePlan() => frameOf(p.end),
    RotatePlan r => MorphFrame(lines: r.lines, rotation: _lerp(r.from, r.to, e)),
    MorphLinesPlan m => _morphFrame(m, e),
  };
}

MorphFrame _morphFrame(MorphLinesPlan p, double e) {
  Seg l(int k) {
    final Seg s = p.from[k];
    final Seg d = p.to[k];
    return Seg(
      _lerp(s.x1, d.x1, e),
      _lerp(s.y1, d.y1, e),
      _lerp(s.x2, d.x2, e),
      _lerp(s.y2, d.y2, e),
      _lerp(s.o, d.o, e),
    );
  }

  return MorphFrame(lines: <Seg>[l(0), l(1), l(2)], rotation: 0.0);
}

/// State at linear progress t: where to start from if interrupted at t.
MorphState stateAt(MorphPlan p, double t) {
  if (t >= 1 || p is NonePlan) return p.end;
  final MorphFrame f = frameAt(p, t);
  if (p is RotatePlan) {
    return MorphState(name: null, group: p.end.group, lines: f.lines, rotation: f.rotation);
  }
  return MorphState(name: null, group: null, lines: f.lines, rotation: 0.0);
}
