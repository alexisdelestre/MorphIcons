// MorphCore.kt — Morph Icons engine, Kotlin port of core/morph-core.ts.
// Change the package to yours.
// -----------------------------------------------------------------------------
// Pure Kotlin + org.json (built into Android, a plain jar on the JVM): no
// android.* / androidx.* imports, so the conformance test runs on a bare JVM.
//
// Ported line-for-line from the reference. Any behavior change must be made
// there first, then mirrored here and re-checked with
// conformance/kotlin/Conformance.kt against conformance/fixtures.json.
//
// Everything is Double (like JS numbers) so results match the fixtures;
// convert to Float only when drawing.
// -----------------------------------------------------------------------------
package com.example.morphicons

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** One rendered line. `o` = opacity (0-1). */
data class Seg(
    val x1: Double,
    val y1: Double,
    val x2: Double,
    val y2: Double,
    val o: Double,
)

/** Always exactly 3 segments. */
typealias Lines = List<Seg>

/** A line in the JSON: [x1, y1, x2, y2] (4 numbers), or null for an unused line. */
typealias RawLine = List<Double>?

data class IconDef(
    val lines: List<RawLine>?,
    val group: String?,
    val rotation: Double?,
)

data class Override(
    /** map[k] = index (0-2) of the target line that source line k morphs into. */
    val map: List<Int>,
    /** flip[k] = true to connect source k's start to the target line's end. */
    val flip: List<Boolean>,
)

data class MorphData(
    val version: Int,
    val viewBox: Double,
    val strokeWidth: Double,
    /** Default transition duration, in milliseconds. */
    val duration: Double,
    val groups: Map<String, List<RawLine>>,
    val icons: Map<String, IconDef>,
    /** Key "from>to". Also used in reverse (inverted) for "to>from". */
    val overrides: Map<String, Override>?,
) {
    companion object {
        /** Parses the morph-icons.json format. */
        fun fromJson(json: String): MorphData {
            val root = JSONObject(json)

            val groups = LinkedHashMap<String, List<RawLine>>()
            val groupsObj: JSONObject? = root.optJSONObject("groups")
            if (groupsObj != null) {
                for (key in keysOf(groupsObj)) groups[key] = parseLines(groupsObj.getJSONArray(key))
            }

            val icons = LinkedHashMap<String, IconDef>()
            val iconsObj: JSONObject = root.getJSONObject("icons")
            for (key in keysOf(iconsObj)) {
                val o: JSONObject = iconsObj.getJSONObject(key)
                icons[key] = IconDef(
                    lines = if (o.has("lines") && !o.isNull("lines")) parseLines(o.getJSONArray("lines")) else null,
                    group = if (o.has("group") && !o.isNull("group")) o.getString("group") else null,
                    rotation = if (o.has("rotation") && !o.isNull("rotation")) o.getDouble("rotation") else null,
                )
            }

            var overrides: Map<String, Override>? = null
            val ovObj: JSONObject? = root.optJSONObject("overrides")
            if (ovObj != null) {
                val ov = LinkedHashMap<String, Override>()
                for (key in keysOf(ovObj)) {
                    val o: JSONObject = ovObj.getJSONObject(key)
                    val mapArr: JSONArray = o.getJSONArray("map")
                    val flipArr: JSONArray = o.getJSONArray("flip")
                    val map = ArrayList<Int>()
                    val flip = ArrayList<Boolean>()
                    for (i in 0 until mapArr.length()) map.add(mapArr.getInt(i))
                    for (i in 0 until flipArr.length()) flip.add(flipArr.getBoolean(i))
                    ov[key] = Override(map, flip)
                }
                overrides = ov
            }

            return MorphData(
                version = root.optInt("version", 1),
                viewBox = root.getDouble("viewBox"),
                strokeWidth = root.getDouble("strokeWidth"),
                duration = root.getDouble("duration"),
                groups = groups,
                icons = icons,
                overrides = overrides,
            )
        }

        // names() rather than keys(): its Java signature is the same on Android
        // and on the Maven org.json jar. It returns null for an empty object.
        private fun keysOf(obj: JSONObject): List<String> {
            val names: JSONArray = obj.names() ?: return emptyList()
            val out = ArrayList<String>()
            for (i in 0 until names.length()) out.add(names.getString(i))
            return out
        }

        private fun parseLines(arr: JSONArray): List<RawLine> {
            val out = ArrayList<RawLine>()
            for (i in 0 until arr.length()) {
                if (arr.isNull(i)) {
                    out.add(null)
                } else {
                    val l: JSONArray = arr.getJSONArray(i)
                    out.add(listOf(l.getDouble(0), l.getDouble(1), l.getDouble(2), l.getDouble(3)))
                }
            }
            return out
        }
    }
}

/**
 * What is on screen. If `group` is set, `lines` is the group's template (local
 * coordinates) and `rotation` applies to it. Otherwise `lines` are absolute
 * and `rotation` is 0. `name` is set only at rest on a known icon.
 */
data class MorphState(
    val name: String?,
    val group: String?,
    val lines: Lines,
    val rotation: Double,
)

sealed class Plan {
    abstract val end: MorphState

    /** Same strings as the reference ("none" / "rotate" / "morph"), for the fixtures. */
    val kind: String
        get() = when (this) {
            is None -> "none"
            is Rotate -> "rotate"
            is Morph -> "morph"
        }

    data class None(override val end: MorphState) : Plan()

    data class Rotate(
        val lines: Lines,
        val from: Double,
        val to: Double,
        override val end: MorphState,
    ) : Plan()

    data class Morph(
        val from: Lines,
        val to: Lines,
        val map: List<Int>,
        val flip: List<Boolean>,
        /** "auto" or "override". */
        val source: String,
        override val end: MorphState,
    ) : Plan()
}

/** What to draw: the 3 lines, rotated by `rotation` degrees (clockwise) around the center. */
data class Frame(
    val lines: Lines,
    val rotation: Double,
)

/** Result of the automatic matching. */
data class Match(
    val map: List<Int>,
    val flip: List<Boolean>,
    val cost: Double,
)

object MorphEngine {
    // ---- Constants shared by every port ---------------------------------------

    /** Matching tolerance: a candidate replaces the current best only if it is
     *  cheaper by more than this. Keeps float-level near-ties deterministic. */
    const val MATCH_EPSILON: Double = 1e-6

    /** Nudge applied to a visible zero-length line (a "dot") so every renderer
     *  draws its round cap. */
    const val DOT_NUDGE: Double = 0.01

    /** Enumeration order matters (ties go to the first candidate). Same order in every port. */
    val PERMUTATIONS: List<List<Int>> = listOf(
        listOf(0, 1, 2),
        listOf(0, 2, 1),
        listOf(1, 0, 2),
        listOf(1, 2, 0),
        listOf(2, 0, 1),
        listOf(2, 1, 0),
    )

    // ---- Easing -----------------------------------------------------------------

    /** easeInOutCubic, clamped to [0, 1]. */
    fun ease(t: Double): Double {
        if (t <= 0.0) return 0.0
        if (t >= 1.0) return 1.0
        return if (t < 0.5) 4.0 * t * t * t else 1.0 - (-2.0 * t + 2.0).pow(3.0) / 2.0
    }

    private fun lerp(a: Double, b: Double, t: Double): Double = a + (b - a) * t

    // ---- Data -> lines ------------------------------------------------------------

    fun toSeg(raw: RawLine, center: Double): Seg {
        if (raw == null) return Seg(center, center, center, center, 0.0)
        val x1 = raw[0]
        val y1 = raw[1]
        val x2 = raw[2]
        val y2 = raw[3]
        if (x1 == x2 && y1 == y2) return Seg(x1, y1, x2 + DOT_NUDGE, y2, 1.0)
        return Seg(x1, y1, x2, y2, 1.0)
    }

    private fun toLines(raw: List<RawLine>, center: Double): Lines =
        listOf(toSeg(raw[0], center), toSeg(raw[1], center), toSeg(raw[2], center))

    fun bake(lines: Lines, rotation: Double, center: Double): Lines {
        // Seg is immutable, so a new list of the same values is a full copy.
        if (rotation == 0.0) return listOf(lines[0], lines[1], lines[2])
        val r = (rotation * PI) / 180.0
        val c = cos(r)
        val s = sin(r)
        fun rot(seg: Seg): Seg {
            val dx1 = seg.x1 - center
            val dy1 = seg.y1 - center
            val dx2 = seg.x2 - center
            val dy2 = seg.y2 - center
            return Seg(
                x1 = center + dx1 * c - dy1 * s,
                y1 = center + dx1 * s + dy1 * c,
                x2 = center + dx2 * c - dy2 * s,
                y2 = center + dx2 * s + dy2 * c,
                o = seg.o,
            )
        }
        return listOf(rot(lines[0]), rot(lines[1]), rot(lines[2]))
    }

    /** The resting state of an icon (what is displayed when not animating). */
    fun restState(data: MorphData, name: String): MorphState {
        val def: IconDef = data.icons[name] ?: throw IllegalArgumentException("Unknown icon \"$name\"")
        val center = data.viewBox / 2.0
        val rotation: Double = def.rotation ?: 0.0
        val group: String? = def.group
        if (!group.isNullOrEmpty()) {
            val tpl: List<RawLine> = data.groups[group]
                ?: throw IllegalArgumentException("Icon \"$name\": unknown group \"$group\"")
            return MorphState(name, group, toLines(tpl, center), rotation)
        }
        val raw: List<RawLine> = def.lines
            ?: throw IllegalArgumentException("Icon \"$name\": needs \"lines\" or \"group\"")
        return MorphState(name, null, bake(toLines(raw, center), rotation, center), 0.0)
    }

    fun frameOf(state: MorphState): Frame = Frame(state.lines, state.rotation)

    // ---- Rotation -------------------------------------------------------------------

    /** Signed delta in [-180, 180) to go from `from` to `to` the short way.
     *  Kotlin's `%` on Double keeps the dividend's sign, exactly like JS (not mod()). */
    fun shortestDelta(from: Double, to: Double): Double =
        ((((to - from) % 360.0) + 540.0) % 360.0) - 180.0

    // ---- Line matching ----------------------------------------------------------------

    private fun dist(ax: Double, ay: Double, bx: Double, by: Double): Double {
        val dx = ax - bx
        val dy = ay - by
        return sqrt(dx * dx + dy * dy) // not hypot: identical to the other ports
    }

    /** Least-travel correspondence between the lines of `a` and `b` (absolute coordinates). */
    fun match(a: Lines, b: Lines): Match {
        var best = Double.POSITIVE_INFINITY
        var bestPerm: List<Int> = PERMUTATIONS[0]
        var bestMask = 0
        for (perm in PERMUTATIONS) {
            for (mask in 0 until 8) {
                var cost = 0.0
                for (k in 0 until 3) {
                    val s = a[k]
                    val t = b[perm[k]]
                    if (((mask shr k) and 1) != 0) {
                        cost += dist(s.x1, s.y1, t.x2, t.y2) + dist(s.x2, s.y2, t.x1, t.y1)
                    } else {
                        cost += dist(s.x1, s.y1, t.x1, t.y1) + dist(s.x2, s.y2, t.x2, t.y2)
                    }
                }
                if (cost < best - MATCH_EPSILON) {
                    best = cost
                    bestPerm = perm
                    bestMask = mask
                }
            }
        }
        return Match(
            map = listOf(bestPerm[0], bestPerm[1], bestPerm[2]),
            flip = listOf((bestMask and 1) != 0, (bestMask and 2) != 0, (bestMask and 4) != 0),
            cost = best,
        )
    }

    /** Forced matching for from>to, or the inverse of to>from. null if none. */
    fun overrideFor(data: MorphData, from: String, to: String): Override? {
        val ov: Map<String, Override> = data.overrides ?: return null
        val direct: Override? = ov["$from>$to"]
        if (direct != null) return Override(direct.map.toList(), direct.flip.toList())
        val rev: Override = ov["$to>$from"] ?: return null
        val map: MutableList<Int> = mutableListOf(0, 0, 0)
        val flip: MutableList<Boolean> = mutableListOf(false, false, false)
        for (k in 0 until 3) {
            map[rev.map[k]] = k
            flip[rev.map[k]] = rev.flip[k]
        }
        return Override(map, flip)
    }

    private fun arrange(b: Lines, map: List<Int>, flip: List<Boolean>): Lines {
        fun pick(k: Int): Seg {
            val s = b[map[k]]
            return if (flip[k]) Seg(s.x2, s.y2, s.x1, s.y1, s.o) else s
        }
        return listOf(pick(0), pick(1), pick(2))
    }

    // ---- Planning & sampling ----------------------------------------------------------

    /** Describes the transition from what's on screen (`from`) to icon `to`. */
    fun plan(data: MorphData, from: MorphState, to: String): Plan {
        val end = restState(data, to)
        if (from.name == to) return Plan.None(end)

        if (from.group != null && from.group == end.group) {
            return Plan.Rotate(
                lines = from.lines,
                from = from.rotation,
                to = from.rotation + shortestDelta(from.rotation, end.rotation),
                end = end,
            )
        }

        val center = data.viewBox / 2.0
        val a: Lines = if (from.group != null) bake(from.lines, from.rotation, center) else from.lines
        val b: Lines = if (end.group != null) bake(end.lines, end.rotation, center) else end.lines
        val fromName: String? = from.name
        val forced: Override? = if (fromName != null) overrideFor(data, fromName, to) else null
        val map: List<Int>
        val flip: List<Boolean>
        if (forced != null) {
            map = forced.map
            flip = forced.flip
        } else {
            val m = match(a, b)
            map = m.map
            flip = m.flip
        }
        return Plan.Morph(
            from = a,
            to = arrange(b, map, flip),
            map = map,
            flip = flip,
            source = if (forced != null) "override" else "auto",
            end = end,
        )
    }

    /** Frame to draw at linear progress t (0-1). Easing is applied here. */
    fun frameAt(p: Plan, t: Double): Frame {
        val e = ease(t)
        return when (p) {
            is Plan.None -> frameOf(p.end)
            is Plan.Rotate -> Frame(p.lines, lerp(p.from, p.to, e))
            is Plan.Morph -> {
                val m: Plan.Morph = p
                fun l(k: Int): Seg {
                    val s = m.from[k]
                    val d = m.to[k]
                    return Seg(
                        x1 = lerp(s.x1, d.x1, e),
                        y1 = lerp(s.y1, d.y1, e),
                        x2 = lerp(s.x2, d.x2, e),
                        y2 = lerp(s.y2, d.y2, e),
                        o = lerp(s.o, d.o, e),
                    )
                }
                Frame(listOf(l(0), l(1), l(2)), 0.0)
            }
        }
    }

    /** State at linear progress t: where to start from if interrupted at t. */
    fun stateAt(p: Plan, t: Double): MorphState {
        if (t >= 1.0 || p is Plan.None) return p.end
        val f = frameAt(p, t)
        if (p is Plan.Rotate) return MorphState(null, p.end.group, f.lines, f.rotation)
        return MorphState(null, null, f.lines, 0.0)
    }
}
