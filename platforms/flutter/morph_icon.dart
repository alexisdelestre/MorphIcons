// morph_icon.dart — Morph Icons for Flutter.
// -----------------------------------------------------------------------------
// The Flutter animation layer over morph_core.dart (which replaces the
// reference's JS `MorphDriver`): one AnimationController per icon, a
// CustomPainter that repaints from the controller (no setState per frame), and
// interruptions that restart from the on-screen state.
//
// Setup
//
//   1. Copy morph_core.dart, morph_icon.dart and morph-icons.json into your app,
//      then declare the JSON as an asset in pubspec.yaml:
//
//        flutter:
//          assets:
//            - assets/morph-icons.json
//
//   2. Load the data once, before runApp:
//
//        Future<void> main() async {
//          WidgetsFlutterBinding.ensureInitialized();
//          await MorphIconData.load();
//          runApp(const MyApp());
//        }
//
//   3. Use it like an Icon. Changing `name` animates:
//
//        IconButton(
//          tooltip: isOpen ? 'Close menu' : 'Open menu',
//          onPressed: () => setState(() => isOpen = !isOpen),
//          icon: MorphIcon(isOpen ? 'cross' : 'menu'),
//        )
//
// Accessibility: MorphIcon paints lines only and exposes no semantics of its
// own. Give the enclosing control a label (IconButton `tooltip`, or wrap it in
// `Semantics(label: ...)`) that describes the action, not the shape. When the
// platform asks to reduce motion (MediaQueryData.disableAnimations), changes
// jump instantly.
// -----------------------------------------------------------------------------

import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'morph_core.dart'
    show MorphData, MorphFrame, MorphPlan, MorphState, Seg, frameAt, frameOf, plan, restState, stateAt;

export 'morph_core.dart' show MorphData;

/// Holds the icon data loaded from the asset bundle, shared by every MorphIcon
/// that is not given its own `data`.
class MorphIconData {
  MorphIconData._();

  static MorphData? _instance;

  /// Loads and parses the JSON asset. Await it in main(), after
  /// `WidgetsFlutterBinding.ensureInitialized()` and before `runApp`.
  static Future<MorphData> load([String asset = 'assets/morph-icons.json']) async {
    final String json = await rootBundle.loadString(asset);
    final MorphData data = MorphData.parse(json);
    _instance = data;
    return data;
  }

  /// The data loaded by [load]. Throws a [StateError] if [load] has not completed.
  static MorphData get instance {
    final MorphData? data = _instance;
    if (data == null) {
      throw StateError(
        'MorphIconData.instance used before MorphIconData.load() completed. '
        'In main(): WidgetsFlutterBinding.ensureInitialized(); '
        'await MorphIconData.load(); runApp(...). '
        'Or pass `data:` to MorphIcon.',
      );
    }
    return data;
  }
}

/// A 3-line icon that morphs into the new icon whenever [name] changes.
///
/// ```dart
/// MorphIcon(isPlaying ? 'pause' : 'play', size: 32)
/// ```
///
/// Interruptible: changing [name] mid-transition continues from what is on
/// screen. The first build shows [name] at rest, without animating.
class MorphIcon extends StatefulWidget {
  const MorphIcon(
    this.name, {
    super.key,
    this.size = 24.0,
    this.color,
    this.duration,
    this.data,
  });

  /// Icon name, a key of `icons` in morph-icons.json.
  final String name;

  /// Width and height in logical pixels.
  final double size;

  /// Line color. Defaults to `IconTheme.of(context).color`.
  final Color? color;

  /// Transition duration. Defaults to the JSON's `duration` (ms).
  /// [Duration.zero] jumps instantly.
  final Duration? duration;

  /// Icon data. Defaults to [MorphIconData.instance].
  final MorphData? data;

  @override
  State<MorphIcon> createState() => _MorphIconState();
}

class _MorphIconState extends State<MorphIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  /// What is shown when no transition is running.
  late MorphState _rest;

  /// The running transition, or null at rest.
  MorphPlan? _transition;

  MorphData get _data => widget.data ?? MorphIconData.instance;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this);
    _controller.addStatusListener(_onStatus);
    _rest = restState(_data, widget.name);
  }

  @override
  void didUpdateWidget(MorphIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.data, oldWidget.data)) {
      // New data (e.g. a new JSON version): jump, like the reference's setData.
      _controller.stop();
      _transition = null;
      _rest = restState(_data, widget.name);
      return;
    }
    if (widget.name != oldWidget.name) _go(widget.name);
  }

  /// Animates to [name] from the on-screen state. The build that always
  /// follows didUpdateWidget hands the new plan to the painter.
  void _go(String name) {
    final MorphPlan? current = _transition;
    final String? target = current != null ? current.end.name : _rest.name;
    if (name == target) return;

    // Where we are right now: mid-transition, or at rest.
    final MorphState live = current != null ? stateAt(current, _controller.value) : _rest;
    _controller.stop();

    final MorphData data = _data;
    final Duration duration = widget.duration ?? Duration(milliseconds: data.duration.round());
    final bool reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion || duration.inMicroseconds <= 0) {
      _transition = null;
      _rest = restState(data, name);
      return;
    }

    _rest = live;
    _transition = plan(data, live, name);
    _controller.duration = duration;
    _controller.forward(from: 0.0);
  }

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    final MorphPlan? current = _transition;
    if (current == null || !mounted) return;
    // One rebuild per transition (not per frame) to hand the painter the rest state.
    setState(() {
      _rest = current.end;
      _transition = null;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MorphData data = _data;
    final Color color = widget.color ?? IconTheme.of(context).color ?? const Color(0xFF000000);
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: CustomPaint(
        painter: _MorphPainter(
          animation: _controller,
          transition: _transition,
          rest: _rest,
          color: color,
          viewBox: data.viewBox,
          strokeWidth: data.strokeWidth,
        ),
      ),
    );
  }
}

class _MorphPainter extends CustomPainter {
  _MorphPainter({
    required this.animation,
    required this.transition,
    required this.rest,
    required this.color,
    required this.viewBox,
    required this.strokeWidth,
  }) : super(repaint: animation);

  /// Linear progress 0-1; easing is applied by frameAt.
  final Animation<double> animation;
  final MorphPlan? transition;
  final MorphState rest;
  final Color color;
  final double viewBox;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final MorphPlan? p = transition;
    final MorphFrame frame = p != null ? frameAt(p, animation.value) : frameOf(rest);
    final double scale = size.shortestSide / viewBox;
    final double c = viewBox / 2 * scale;
    final Paint paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = strokeWidth * scale;

    canvas.save();
    if (frame.rotation != 0.0) {
      // Degrees clockwise around the center. Like SVG, y points down, so a
      // positive canvas.rotate is clockwise on screen: no sign change.
      canvas.translate(c, c);
      canvas.rotate(frame.rotation * math.pi / 180);
      canvas.translate(-c, -c);
    }
    for (final Seg s in frame.lines) {
      final double o = math.min(1.0, math.max(0.0, s.o));
      if (o <= 0.0) continue;
      // Multiply, so a translucent theme color (e.g. disabled) stays translucent.
      paint.color = color.withOpacity(color.opacity * o);
      canvas.drawLine(Offset(s.x1 * scale, s.y1 * scale), Offset(s.x2 * scale, s.y2 * scale), paint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _MorphPainter oldDelegate) {
    // Animation ticks repaint through `repaint`; this only covers new inputs.
    return !identical(oldDelegate.transition, transition) ||
        !identical(oldDelegate.rest, rest) ||
        oldDelegate.animation != animation ||
        oldDelegate.color != color ||
        oldDelegate.viewBox != viewBox ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}
