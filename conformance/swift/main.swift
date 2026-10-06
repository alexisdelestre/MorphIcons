// main.swift — Swift conformance runner for MorphCore.swift.
// Runs the same checks as the fixture test in tests/core.test.ts.
//
// Build & run (from the project root):
//   swiftc -O platforms/swiftui/MorphCore.swift conformance/swift/main.swift -o /tmp/morph-swift-conformance
//   /tmp/morph-swift-conformance conformance/fixtures.json
// Exits 1 (and prints the first failures) on any mismatch.

import Foundation

struct FixtureFrame: Decodable {
    let t: Double
    let rotation: Double
    let lines: [[Double]]
}

struct FixtureTransition: Decodable {
    let from: String
    let to: String
    let kind: String
    let map: [Int]?
    let flip: [Bool]?
    let source: String?
    let rotFrom: Double?
    let rotTo: Double?
    let frames: [FixtureFrame]
}

struct FixtureChain: Decodable {
    let from: String
    let via: String
    let cut: Double
    let to: String
    let kind: String
    let frames: [FixtureFrame]
}

struct Fixtures: Decodable {
    let tolerance: Double
    let data: MorphData
    let ease: [[Double]]
    let shortestDelta: [[Double]]
    let transitions: [FixtureTransition]
    let chains: [FixtureChain]
}

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "conformance/fixtures.json"

let fx: Fixtures
do {
    fx = try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
} catch {
    print("Swift conformance: cannot read \(path): \(error)")
    exit(1)
}

/// Collects failures. A class rather than top-level vars: those are main-actor
/// isolated in Swift 6 mode, which would make the helpers below awkward.
final class Report {
    let tol: Double
    var failures: [String] = []

    init(tolerance: Double) { tol = tolerance }

    func check(_ ok: Bool, _ message: @autoclosure () -> String) {
        if !ok { failures.append(message()) }
    }

    func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= tol }

    func sameFrame(_ got: Morph.Frame, _ want: FixtureFrame, _ label: String) {
        check(near(got.rotation, want.rotation), "\(label): rotation \(got.rotation), expected \(want.rotation)")
        guard want.lines.count == 3 else {
            check(false, "\(label): fixture has \(want.lines.count) lines")
            return
        }
        for (k, s) in got.lines.enumerated() {
            let values = [s.x1, s.y1, s.x2, s.y2, s.o]
            let expected = want.lines[k]
            let ok = expected.count == 5 && zip(values, expected).allSatisfy { near($0, $1) }
            check(ok, "\(label): line \(k) = \(values), expected \(expected)")
        }
    }
}

let report = Report(tolerance: fx.tolerance)

for pair in fx.ease {
    let got = Morph.ease(pair[0])
    report.check(report.near(got, pair[1]), "ease(\(pair[0])) = \(got), expected \(pair[1])")
}

for triple in fx.shortestDelta {
    let got = Morph.shortestDelta(triple[0], triple[1])
    report.check(report.near(got, triple[2]), "shortestDelta(\(triple[0]), \(triple[1])) = \(got), expected \(triple[2])")
}

for tr in fx.transitions {
    let label = "\(tr.from)->\(tr.to)"
    do {
        let p = try Morph.plan(fx.data, try Morph.restState(fx.data, tr.from), tr.to)
        report.check(p.kind == tr.kind, "\(label): kind \(p.kind), expected \(tr.kind)")
        switch p {
        case .morph(_, _, let map, let flip, let source, _):
            report.check(map == tr.map, "\(label): map \(map), expected \(tr.map.map { "\($0)" } ?? "none")")
            report.check(flip == tr.flip, "\(label): flip \(flip), expected \(tr.flip.map { "\($0)" } ?? "none")")
            report.check(source.rawValue == tr.source, "\(label): source \(source.rawValue), expected \(tr.source ?? "none")")
        case .rotate(_, let from, let to, _):
            // Not checked by the TS test, but present in the fixtures: free extra coverage.
            if let rotFrom = tr.rotFrom { report.check(report.near(from, rotFrom), "\(label): rotFrom \(from), expected \(rotFrom)") }
            if let rotTo = tr.rotTo { report.check(report.near(to, rotTo), "\(label): rotTo \(to), expected \(rotTo)") }
        case .none:
            break
        }
        for f in tr.frames { report.sameFrame(Morph.frameAt(p, f.t), f, "\(label)@\(f.t)") }
    } catch {
        report.check(false, "\(label): \(error)")
    }
}

for ch in fx.chains {
    let label = "chain \(ch.from)>\(ch.via)>\(ch.to)"
    do {
        let mid = Morph.stateAt(try Morph.plan(fx.data, try Morph.restState(fx.data, ch.from), ch.via), ch.cut)
        let p = try Morph.plan(fx.data, mid, ch.to)
        report.check(p.kind == ch.kind, "\(label): kind \(p.kind), expected \(ch.kind)")
        for f in ch.frames { report.sameFrame(Morph.frameAt(p, f.t), f, "\(label)@\(f.t)") }
    } catch {
        report.check(false, "\(label): \(error)")
    }
}

let counts = "\(fx.transitions.count) transitions, \(fx.chains.count) chains, \(fx.ease.count) ease, \(fx.shortestDelta.count) shortestDelta"
if report.failures.isEmpty {
    print("Swift conformance: \(counts) — OK")
} else {
    print("Swift conformance: \(counts) — \(report.failures.count) FAILURE(S)")
    for f in report.failures.prefix(20) { print("  - \(f)") }
    if report.failures.count > 20 { print("  ... and \(report.failures.count - 20) more") }
    exit(1)
}
