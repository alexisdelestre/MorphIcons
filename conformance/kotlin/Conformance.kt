// Conformance.kt — checks the Kotlin engine (platforms/compose/MorphCore.kt)
// against conformance/fixtures.json, exactly like the last test of
// tests/core.test.ts. Plain JVM, no Android needed.
//
// Run from the project root (json.jar = org.json from Maven Central,
// e.g. org.json:json:20240303):
//   kotlinc platforms/compose/MorphCore.kt conformance/kotlin/Conformance.kt -cp json.jar -include-runtime -d /tmp/conf.jar && java -cp /tmp/conf.jar:json.jar ConformanceKt conformance/fixtures.json

import com.example.morphicons.Frame
import com.example.morphicons.MorphData
import com.example.morphicons.MorphEngine
import com.example.morphicons.MorphState
import com.example.morphicons.Plan
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.abs
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    val path: String = if (args.isNotEmpty()) args[0] else "conformance/fixtures.json"
    val fx = JSONObject(File(path).readText())
    val tol: Double = fx.getDouble("tolerance")
    val data: MorphData = MorphData.fromJson(fx.getJSONObject("data").toString())
    val failures = ArrayList<String>()

    fun near(a: Double, b: Double): Boolean = abs(a - b) <= tol

    fun sameFrame(got: Frame, want: JSONObject, label: String) {
        val wantRot: Double = want.getDouble("rotation")
        if (!near(got.rotation, wantRot)) failures.add("$label: rotation ${got.rotation}, expected $wantRot")
        val lines: JSONArray = want.getJSONArray("lines")
        for (k in 0 until 3) {
            val w: JSONArray = lines.getJSONArray(k)
            val s = got.lines[k]
            val values: DoubleArray = doubleArrayOf(s.x1, s.y1, s.x2, s.y2, s.o)
            for (i in 0 until 5) {
                if (!near(values[i], w.getDouble(i))) {
                    failures.add("$label: line $k got [${values.joinToString()}], expected $w")
                    break
                }
            }
        }
    }

    fun intList(arr: JSONArray): List<Int> {
        val out = ArrayList<Int>()
        for (i in 0 until arr.length()) out.add(arr.getInt(i))
        return out
    }

    fun boolList(arr: JSONArray): List<Boolean> {
        val out = ArrayList<Boolean>()
        for (i in 0 until arr.length()) out.add(arr.getBoolean(i))
        return out
    }

    // Ease samples: [t, expected].
    val easeArr: JSONArray = fx.getJSONArray("ease")
    for (i in 0 until easeArr.length()) {
        val e: JSONArray = easeArr.getJSONArray(i)
        val got: Double = MorphEngine.ease(e.getDouble(0))
        if (!near(got, e.getDouble(1))) failures.add("ease(${e.getDouble(0)}) = $got, expected ${e.getDouble(1)}")
    }

    // shortestDelta samples: [from, to, expected].
    val sdArr: JSONArray = fx.getJSONArray("shortestDelta")
    for (i in 0 until sdArr.length()) {
        val d: JSONArray = sdArr.getJSONArray(i)
        val got: Double = MorphEngine.shortestDelta(d.getDouble(0), d.getDouble(1))
        if (!near(got, d.getDouble(2))) {
            failures.add("shortestDelta(${d.getDouble(0)}, ${d.getDouble(1)}) = $got, expected ${d.getDouble(2)}")
        }
    }

    // Transitions from rest: kind, matching (map/flip/source) and sampled frames.
    val transitions: JSONArray = fx.getJSONArray("transitions")
    for (i in 0 until transitions.length()) {
        val tr: JSONObject = transitions.getJSONObject(i)
        val from: String = tr.getString("from")
        val to: String = tr.getString("to")
        val label = "$from->$to"
        try {
            val p: Plan = MorphEngine.plan(data, MorphEngine.restState(data, from), to)
            val kind: String = tr.getString("kind")
            if (p.kind != kind) {
                failures.add("$label: kind ${p.kind}, expected $kind")
                continue
            }
            if (p is Plan.Morph) {
                val map: List<Int> = intList(tr.getJSONArray("map"))
                val flip: List<Boolean> = boolList(tr.getJSONArray("flip"))
                val source: String = tr.getString("source")
                if (p.map != map) failures.add("$label: map ${p.map}, expected $map")
                if (p.flip != flip) failures.add("$label: flip ${p.flip}, expected $flip")
                if (p.source != source) failures.add("$label: source ${p.source}, expected $source")
            }
            val frames: JSONArray = tr.getJSONArray("frames")
            for (j in 0 until frames.length()) {
                val f: JSONObject = frames.getJSONObject(j)
                val t: Double = f.getDouble("t")
                sameFrame(MorphEngine.frameAt(p, t), f, "$label@$t")
            }
        } catch (e: Exception) {
            failures.add("$label: threw $e")
        }
    }

    // Interruption chains: from -> via, cut at `cut`, then replan to `to`.
    val chains: JSONArray = fx.getJSONArray("chains")
    for (i in 0 until chains.length()) {
        val ch: JSONObject = chains.getJSONObject(i)
        val label = "chain ${ch.getString("from")}>${ch.getString("via")}>${ch.getString("to")}"
        try {
            val first: Plan = MorphEngine.plan(data, MorphEngine.restState(data, ch.getString("from")), ch.getString("via"))
            val mid: MorphState = MorphEngine.stateAt(first, ch.getDouble("cut"))
            val p: Plan = MorphEngine.plan(data, mid, ch.getString("to"))
            val kind: String = ch.getString("kind")
            if (p.kind != kind) {
                failures.add("$label: kind ${p.kind}, expected $kind")
                continue
            }
            val frames: JSONArray = ch.getJSONArray("frames")
            for (j in 0 until frames.length()) {
                val f: JSONObject = frames.getJSONObject(j)
                val t: Double = f.getDouble("t")
                sameFrame(MorphEngine.frameAt(p, t), f, "$label@$t")
            }
        } catch (e: Exception) {
            failures.add("$label: threw $e")
        }
    }

    val summary = "Kotlin conformance: ${transitions.length()} transitions, ${chains.length()} chains"
    if (failures.isEmpty()) {
        println("$summary — OK")
        return
    }
    System.err.println("$summary — ${failures.size} FAILURE(S)")
    for (msg in failures.take(20)) System.err.println("  $msg")
    if (failures.size > 20) System.err.println("  ... and ${failures.size - 20} more")
    exitProcess(1)
}
