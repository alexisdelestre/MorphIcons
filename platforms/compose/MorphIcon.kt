// MorphIcon.kt — Morph Icons for Jetpack Compose.
// Change the package to yours.
// -----------------------------------------------------------------------------
// Needs MorphCore.kt (same package) and morph-icons.json in
// app/src/main/assets/. Dependencies: Compose UI, Foundation, Material 3
// (only for LocalContentColor).
// -----------------------------------------------------------------------------
package com.example.morphicons

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.io.IOException
import kotlin.math.min

/**
 * An icon that morphs into the next one whenever [name] changes.
 *
 * ```kotlin
 * var open by remember { mutableStateOf(false) }
 * IconButton(
 *     onClick = { open = !open },
 *     modifier = Modifier.semantics { contentDescription = if (open) "Close menu" else "Open menu" },
 * ) {
 *     MorphIcon(if (open) "cross" else "menu")
 * }
 * ```
 *
 * MorphIcon is purely decorative and has no contentDescription: describe the
 * action on the clickable parent (as above, with Modifier.semantics), so
 * TalkBack announces what the button does, not the shape it shows.
 *
 * Changing [name] mid-transition continues from what is on screen, no jump.
 * Honors the system "Animator duration scale" (developer options / Remove
 * animations): 0 switches instantly, other values scale the duration.
 *
 * @param name icon to show (a key of "icons" in morph-icons.json).
 * @param size width and height of the icon.
 * @param color stroke color; defaults to the surrounding content color.
 * @param durationMillis transition duration; null = the JSON's "duration", 0 = instant.
 * @param data icon set; defaults to assets/morph-icons.json.
 */
@Composable
fun MorphIcon(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    color: Color = LocalContentColor.current,
    durationMillis: Int? = null,
    data: MorphData = rememberMorphData(),
) {
    val context: Context = LocalContext.current
    // New data = start over at rest on the current icon (no animation).
    val anim: MorphAnimator = remember(data) { MorphAnimator(MorphEngine.restState(data, name)) }

    LaunchedEffect(anim, name) {
        // First composition (or data swap): already showing `name`, nothing to animate.
        if (anim.target() == name) return@LaunchedEffect
        // When `name` changes mid-transition, the previous effect has just been
        // cancelled and `progress` still holds the last value drawn: start from there.
        val from: MorphState = anim.live()
        val baseMs: Double = durationMillis?.toDouble() ?: data.duration
        val totalMs: Double = baseMs * animatorDurationScale(context)
        val p: Plan = MorphEngine.plan(data, from, name)
        if (totalMs <= 0.0 || p is Plan.None) {
            anim.settle(p.end)
            return@LaunchedEffect
        }
        anim.plan.value = p
        anim.progress.value = 0.0
        var start = -1L
        while (true) {
            val now: Long = withFrameNanos { frameTimeNanos -> frameTimeNanos }
            if (start < 0L) start = now
            val t: Double = min(1.0, (now - start).toDouble() / 1_000_000.0 / totalMs)
            anim.progress.value = t
            if (t >= 1.0) break
        }
        anim.settle(p.end)
    }

    Canvas(modifier = modifier.size(size)) {
        // State is read here, in the draw phase: each animation frame only
        // redraws, it doesn't recompose. `this.size` is the DrawScope's size
        // (the `size` parameter above is the Dp argument).
        val frame: Frame = anim.frame()
        val w: Float = this.size.width
        val h: Float = this.size.height
        val viewBox: Float = data.viewBox.toFloat()
        val scale: Float = min(w, h) / viewBox
        val ox: Float = (w - viewBox * scale) / 2f
        val oy: Float = (h - viewBox * scale) / 2f
        val pivot = Offset(w / 2f, h / 2f)
        val stroke: Float = data.strokeWidth.toFloat() * scale
        // Clockwise degrees in a y-down space, like SVG: no sign change.
        rotate(degrees = frame.rotation.toFloat(), pivot = pivot) {
            for (seg in frame.lines) {
                if (seg.o <= 0.0) continue // invisible (unused line)
                drawLine(
                    color = color,
                    start = Offset(ox + seg.x1.toFloat() * scale, oy + seg.y1.toFloat() * scale),
                    end = Offset(ox + seg.x2.toFloat() * scale, oy + seg.y2.toFloat() * scale),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                    alpha = seg.o.toFloat(),
                )
            }
        }
    }
}

/** The icon set from assets/morph-icons.json, parsed once per process. */
@Composable
fun rememberMorphData(): MorphData {
    val context: Context = LocalContext.current
    return remember(context) { MorphIcons.data(context) }
}

/** Process-wide cache of assets/morph-icons.json. */
object MorphIcons {
    const val ASSET_NAME: String = "morph-icons.json"

    @Volatile
    private var cached: MorphData? = null

    fun data(context: Context): MorphData {
        val hit: MorphData? = cached
        if (hit != null) return hit
        return synchronized(this) {
            val again: MorphData? = cached
            if (again != null) return again
            val json: String = try {
                context.assets.open(ASSET_NAME).bufferedReader().use { reader -> reader.readText() }
            } catch (e: IOException) {
                throw IllegalStateException(
                    "MorphIcon: \"$ASSET_NAME\" not found in the app's assets. " +
                        "Put morph-icons.json in app/src/main/assets/.",
                    e,
                )
            }
            val parsed: MorphData = MorphData.fromJson(json)
            cached = parsed
            parsed
        }
    }
}

/** System "Animator duration scale" (0 = animations off). */
private fun animatorDurationScale(context: Context): Double =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f).toDouble()

/** Resting state + current plan + linear progress, as snapshot state. */
private class MorphAnimator(initial: MorphState) {
    val rest: MutableState<MorphState> = mutableStateOf<MorphState>(initial)
    val plan: MutableState<Plan?> = mutableStateOf<Plan?>(null)
    val progress: MutableState<Double> = mutableStateOf<Double>(0.0)

    /** Icon currently shown, or being animated to. */
    fun target(): String? {
        val p: Plan? = plan.value
        return if (p != null) p.end.name else rest.value.name
    }

    /** What is on screen right now, as a state to plan from. */
    fun live(): MorphState {
        val p: Plan = plan.value ?: return rest.value
        return MorphEngine.stateAt(p, progress.value)
    }

    fun frame(): Frame {
        val p: Plan = plan.value ?: return MorphEngine.frameOf(rest.value)
        return MorphEngine.frameAt(p, progress.value)
    }

    fun settle(end: MorphState) {
        rest.value = end
        plan.value = null
        progress.value = 0.0
    }
}
