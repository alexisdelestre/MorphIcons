// MorphCore.swift — Morph Icons engine, Swift port of core/morph-core.ts.
// -----------------------------------------------------------------------------
// Foundation only (no SwiftUI), so it also builds on the command line for the
// conformance runner (conformance/swift/main.swift). This is a line-for-line
// port of the reference: any behavior change in morph-core.ts must be mirrored
// here and re-checked against conformance/fixtures.json.
//
// Naming: the engine types live in the `Morph` namespace (`Morph.State`,
// `Morph.Plan`, ...) so they never shadow SwiftUI's `State` or other common
// names in the app that embeds this file. The JSON model is `MorphData`.
//
// Model
//   - Every icon is exactly 3 lines in a square viewBox (24 by default).
//   - In the JSON a line is [x1, y1, x2, y2], or `null` for an unused line:
//     null becomes a zero-length point at the center with opacity 0.
//   - Icons that are the same shape at different angles share a `group`
//     (a 3-line template) and only differ by `rotation` (degrees, clockwise).
//
// Transition rules
//   1. Same group  -> rotate the template, shortest way round (never more
//      than 180°). The coordinates don't move.
//   2. Otherwise   -> resolve both icons to absolute coordinates, then pick
//      which line goes where: an `overrides` entry if a designer forced one,
//      else the automatic least-travel matching (6 orders x 8 endpoint flips).
//      Then interpolate the coordinates and opacity linearly.
//   All progress goes through easeInOutCubic, identically on every platform.
// -----------------------------------------------------------------------------

import Foundation

// ---- Data (morph-icons.json) ------------------------------------------------------

public struct MorphData: Codable, Equatable, Sendable {
    /// A line as stored in the JSON: `[x1, y1, x2, y2]`, or `nil` for an unused line.
    public typealias RawLine = [Double]?

    public struct IconDef: Codable, Equatable, Sendable {
        public var lines: [RawLine]?
        public var group: String?
        public var rotation: Double?

        public init(lines: [RawLine]? = nil, group: String? = nil, rotation: Double? = nil) {
            self.lines = lines
            self.group = group
            self.rotation = rotation
        }
    }

    public struct Override: Codable, Equatable, Sendable {
        /// map[k] = index (0-2) of the target line that source line k morphs into.
        public var map: [Int]
        /// flip[k] = true to connect source k's start to the target line's end.
        public var flip: [Bool]

        public init(map: [Int], flip: [Bool]) {
            self.map = map
            self.flip = flip
        }
    }

    public var version: Int
    public var viewBox: Double
    public var strokeWidth: Double
    /// Default transition duration, in milliseconds.
    public var duration: Double
    public var groups: [String: [RawLine]]
    public var icons: [String: IconDef]
    /// Key "from>to". Also used in reverse (inverted) for "to>from".
    public var overrides: [String: Override]?

    public init(
        version: Int, viewBox: Double, strokeWidth: Double, duration: Double,
        groups: [String: [RawLine]], icons: [String: IconDef], overrides: [String: Override]? = nil
    ) {
        self.version = version
        self.viewBox = viewBox
        self.strokeWidth = strokeWidth
        self.duration = duration
        self.groups = groups
        self.icons = icons
        self.overrides = overrides
    }
}

extension MorphData {
    /// Decodes a morph-icons.json file.
    public static func load(from url: URL) throws -> MorphData {
        try JSONDecoder().decode(MorphData.self, from: Data(contentsOf: url))
    }

    /// The app's `morph-icons.json`, loaded once from the main bundle.
    /// A missing or broken file is a build mistake, not a runtime condition,
    /// so it stops with an explanation instead of silently drawing nothing.
    public static let shared: MorphData = {
        guard let url = Bundle.main.url(forResource: "morph-icons", withExtension: "json") else {
            fatalError("""
                MorphData.shared: morph-icons.json was not found in the app bundle (\(Bundle.main.bundlePath)). \
                Add morph-icons.json to your app target: drag it into the Xcode project, tick your app target \
                under "Target Membership", and check it is listed in Build Phases > "Copy Bundle Resources". \
                Or pass your own data: MorphIcon("menu", data: try MorphData.load(from: url)).
                """)
        }
        do {
            return try load(from: url)
        } catch {
            fatalError("MorphData.shared: could not decode \(url.path): \(error)")
        }
    }()
}

public enum MorphError: Error, Equatable, CustomStringConvertible, LocalizedError {
    case unknownIcon(String)
    case unknownGroup(icon: String, group: String)
    case missingLines(icon: String)
    /// Not a TS error: Swift would trap on an out-of-range index where JS reads `undefined`.
    case malformedLines(String)

    public var description: String {
        switch self {
        case .unknownIcon(let name): return "Unknown icon \"\(name)\""
        case .unknownGroup(let icon, let group): return "Icon \"\(icon)\": unknown group \"\(group)\""
        case .missingLines(let icon): return "Icon \"\(icon)\": needs \"lines\" or \"group\""
        case .malformedLines(let reason): return reason
        }
    }

    public var errorDescription: String? { description }
}

// ---- Engine --------------------------------------------------------------------------

public enum Morph {
    /// One rendered line. `o` = opacity (0-1).
    public struct Seg: Equatable, Sendable {
        public var x1: Double
        public var y1: Double
        public var x2: Double
        public var y2: Double
        public var o: Double

        public init(x1: Double, y1: Double, x2: Double, y2: Double, o: Double) {
            self.x1 = x1
            self.y1 = y1
            self.x2 = x2
            self.y2 = y2
            self.o = o
        }
    }

    /// Exactly 3 lines, stored inline (no array, so the count can't drift).
    public struct Lines: Equatable, Sendable, RandomAccessCollection, MutableCollection {
        public var l0: Seg
        public var l1: Seg
        public var l2: Seg

        public init(_ l0: Seg, _ l1: Seg, _ l2: Seg) {
            self.l0 = l0
            self.l1 = l1
            self.l2 = l2
        }

        public var startIndex: Int { 0 }
        public var endIndex: Int { 3 }

        public subscript(k: Int) -> Seg {
            get {
                switch k {
                case 0: return l0
                case 1: return l1
                case 2: return l2
                default: preconditionFailure("Lines index \(k) out of range 0...2")
                }
            }
            set {
                switch k {
                case 0: l0 = newValue
                case 1: l1 = newValue
                case 2: l2 = newValue
                default: preconditionFailure("Lines index \(k) out of range 0...2")
                }
            }
        }
    }

    /// What is on screen. If `group` is set, `lines` is the group's template (local
    /// coordinates) and `rotation` applies to it. Otherwise `lines` are absolute
    /// and `rotation` is 0. `name` is set only at rest on a known icon.
    public struct State: Equatable, Sendable {
        public var name: String?
        public var group: String?
        public var lines: Lines
        public var rotation: Double

        public init(name: String?, group: String?, lines: Lines, rotation: Double) {
            self.name = name
            self.group = group
            self.lines = lines
            self.rotation = rotation
        }
    }

    public enum Source: String, Equatable, Sendable {
        case auto
        case override
    }

    public enum Plan: Equatable, Sendable {
        case none(end: State)
        case rotate(lines: Lines, from: Double, to: Double, end: State)
        case morph(from: Lines, to: Lines, map: [Int], flip: [Bool], source: Source, end: State)

        /// The resting state once the transition is over.
        public var end: State {
            switch self {
            case .none(let end), .rotate(_, _, _, let end), .morph(_, _, _, _, _, let end): return end
            }
        }

        /// "none" | "rotate" | "morph", as in the TS `kind` (and the fixtures).
        public var kind: String {
            switch self {
            case .none: return "none"
            case .rotate: return "rotate"
            case .morph: return "morph"
            }
        }
    }

    /// What to draw: the 3 lines, rotated by `rotation` degrees around the center.
    public struct Frame: Equatable, Sendable {
        public var lines: Lines
        public var rotation: Double

        public init(lines: Lines, rotation: Double) {
            self.lines = lines
            self.rotation = rotation
        }
    }

    /// Result of the automatic matching (an override plus its travel cost).
    public struct Match: Equatable, Sendable {
        public var map: [Int]
        public var flip: [Bool]
        public var cost: Double
    }

    // ---- Constants shared by every port -------------------------------------------

    /// Matching tolerance: a candidate replaces the current best only if it is
    /// cheaper by more than this. Keeps float-level near-ties deterministic.
    public static let matchEpsilon = 1e-6

    /// Nudge applied to a visible zero-length line (a "dot") so every renderer
    /// draws its round cap.
    public static let dotNudge = 0.01

    /// Enumeration order matters (ties go to the first candidate). Same order in every port.
    public static let permutations: [[Int]] = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
    ]

    // ---- Easing ---------------------------------------------------------------------

    public static func ease(_ t: Double) -> Double {
        if t <= 0 { return 0 }
        if t >= 1 { return 1 }
        return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }

    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    // ---- Data -> lines -----------------------------------------------------------

    /// `raw` must be nil or exactly 4 numbers (`restState` checks this first).
    public static func toSeg(_ raw: MorphData.RawLine, center: Double) -> Seg {
        guard let raw = raw else { return Seg(x1: center, y1: center, x2: center, y2: center, o: 0) }
        let x1 = raw[0], y1 = raw[1], x2 = raw[2], y2 = raw[3]
        if x1 == x2 && y1 == y2 { return Seg(x1: x1, y1: y1, x2: x2 + dotNudge, y2: y2, o: 1) }
        return Seg(x1: x1, y1: y1, x2: x2, y2: y2, o: 1)
    }

    /// Swift traps on a bad index where JS reads `undefined`, so check the shape up front.
    static func toLines(_ raw: [MorphData.RawLine], center: Double, where label: String) throws -> Lines {
        guard raw.count == 3 else { throw MorphError.malformedLines("\(label): exactly 3 lines expected") }
        for (i, line) in raw.enumerated() where line != nil && line?.count != 4 {
            throw MorphError.malformedLines("\(label), line \(i + 1): [x1, y1, x2, y2] or null expected")
        }
        return Lines(toSeg(raw[0], center: center), toSeg(raw[1], center: center), toSeg(raw[2], center: center))
    }

    public static func bake(_ lines: Lines, rotation: Double, center: Double) -> Lines {
        if rotation == 0 { return lines } // value type: already a copy
        let r = (rotation * Double.pi) / 180
        let cos = Foundation.cos(r)
        let sin = Foundation.sin(r)
        func rot(_ s: Seg) -> Seg {
            let dx1 = s.x1 - center
            let dy1 = s.y1 - center
            let dx2 = s.x2 - center
            let dy2 = s.y2 - center
            return Seg(
                x1: center + dx1 * cos - dy1 * sin,
                y1: center + dx1 * sin + dy1 * cos,
                x2: center + dx2 * cos - dy2 * sin,
                y2: center + dx2 * sin + dy2 * cos,
                o: s.o
            )
        }
        return Lines(rot(lines[0]), rot(lines[1]), rot(lines[2]))
    }

    /// The resting state of an icon (what `set(name)` displays).
    public static func restState(_ data: MorphData, _ name: String) throws -> State {
        guard let def = data.icons[name] else { throw MorphError.unknownIcon(name) }
        let center = data.viewBox / 2
        let rotation = def.rotation ?? 0
        if let group = def.group {
            guard let tpl = data.groups[group] else { throw MorphError.unknownGroup(icon: name, group: group) }
            return State(name: name, group: group, lines: try toLines(tpl, center: center, where: "Group \"\(group)\""), rotation: rotation)
        }
        guard let lines = def.lines else { throw MorphError.missingLines(icon: name) }
        let abs = bake(try toLines(lines, center: center, where: "Icon \"\(name)\""), rotation: rotation, center: center)
        return State(name: name, group: nil, lines: abs, rotation: 0)
    }

    public static func frameOf(_ state: State) -> Frame {
        Frame(lines: state.lines, rotation: state.rotation)
    }

    // ---- Rotation ---------------------------------------------------------------------

    /// Signed delta in [-180, 180) to go from `from` to `to` the short way.
    /// `truncatingRemainder` has the sign semantics of JS `%` (sign of the dividend).
    public static func shortestDelta(_ from: Double, _ to: Double) -> Double {
        (((to - from).truncatingRemainder(dividingBy: 360) + 540).truncatingRemainder(dividingBy: 360)) - 180
    }

    // ---- Line matching -----------------------------------------------------------------

    static func dist(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double {
        let dx = ax - bx
        let dy = ay - by
        return (dx * dx + dy * dy).squareRoot() // not hypot: identical to the other ports
    }

    /// Least-travel correspondence between the lines of `a` and `b` (absolute coordinates).
    public static func match(_ a: Lines, _ b: Lines) -> Match {
        var best = Double.infinity
        var bestPerm = permutations[0]
        var bestMask = 0
        for perm in permutations {
            for mask in 0..<8 {
                var cost = 0.0
                for k in 0..<3 {
                    let s = a[k]
                    let t = b[perm[k]]
                    if (mask >> k) & 1 != 0 {
                        cost += dist(s.x1, s.y1, t.x2, t.y2) + dist(s.x2, s.y2, t.x1, t.y1)
                    } else {
                        cost += dist(s.x1, s.y1, t.x1, t.y1) + dist(s.x2, s.y2, t.x2, t.y2)
                    }
                }
                if cost < best - matchEpsilon {
                    best = cost
                    bestPerm = perm
                    bestMask = mask
                }
            }
        }
        return Match(
            map: [bestPerm[0], bestPerm[1], bestPerm[2]],
            flip: [(bestMask & 1) != 0, (bestMask & 2) != 0, (bestMask & 4) != 0],
            cost: best
        )
    }

    /// Forced matching for from>to, or the inverse of to>from. nil if none.
    public static func overrideFor(_ data: MorphData, _ from: String, _ to: String) -> MorphData.Override? {
        guard let ov = data.overrides else { return nil }
        if let direct = ov["\(from)>\(to)"] { return direct }
        guard let rev = ov["\(to)>\(from)"] else { return nil }
        var map = [0, 0, 0]
        var flip = [false, false, false]
        for k in 0..<3 {
            map[rev.map[k]] = k
            flip[rev.map[k]] = rev.flip[k]
        }
        return MorphData.Override(map: map, flip: flip)
    }

    static func arrange(_ b: Lines, map: [Int], flip: [Bool]) -> Lines {
        func pick(_ k: Int) -> Seg {
            let s = b[map[k]]
            return flip[k] ? Seg(x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, o: s.o) : s
        }
        return Lines(pick(0), pick(1), pick(2))
    }

    // ---- Planning & sampling --------------------------------------------------------

    /// Describes the transition from what's on screen (`from`) to icon `to`.
    public static func plan(_ data: MorphData, _ from: State, _ to: String) throws -> Plan {
        let end = try restState(data, to)
        if from.name == to { return .none(end: end) }

        if from.group != nil && from.group == end.group {
            return .rotate(
                lines: from.lines,
                from: from.rotation,
                to: from.rotation + shortestDelta(from.rotation, end.rotation),
                end: end
            )
        }

        let center = data.viewBox / 2
        let a = from.group != nil ? bake(from.lines, rotation: from.rotation, center: center) : from.lines
        let b = end.group != nil ? bake(end.lines, rotation: end.rotation, center: center) : end.lines
        let forced = from.name.flatMap { overrideFor(data, $0, to) }
        let map: [Int]
        let flip: [Bool]
        if let forced = forced {
            map = forced.map
            flip = forced.flip
        } else {
            let m = match(a, b)
            map = m.map
            flip = m.flip
        }
        return .morph(
            from: a,
            to: arrange(b, map: map, flip: flip),
            map: map,
            flip: flip,
            source: forced != nil ? .override : .auto,
            end: end
        )
    }

    /// Frame to draw at linear progress t (0-1). Easing is applied here.
    public static func frameAt(_ p: Plan, _ t: Double) -> Frame {
        let e = ease(t)
        switch p {
        case .none(let end):
            return frameOf(end)
        case .rotate(let lines, let from, let to, _):
            return Frame(lines: lines, rotation: lerp(from, to, e))
        case .morph(let from, let to, _, _, _, _):
            func l(_ k: Int) -> Seg {
                let s = from[k]
                let d = to[k]
                return Seg(
                    x1: lerp(s.x1, d.x1, e),
                    y1: lerp(s.y1, d.y1, e),
                    x2: lerp(s.x2, d.x2, e),
                    y2: lerp(s.y2, d.y2, e),
                    o: lerp(s.o, d.o, e)
                )
            }
            return Frame(lines: Lines(l(0), l(1), l(2)), rotation: 0)
        }
    }

    /// State at linear progress t: where to start from if interrupted at t.
    public static func stateAt(_ p: Plan, _ t: Double) -> State {
        if t >= 1 { return p.end }
        switch p {
        case .none(let end):
            return end
        case .rotate(_, _, _, let end):
            let f = frameAt(p, t)
            return State(name: nil, group: end.group, lines: f.lines, rotation: f.rotation)
        case .morph:
            let f = frameAt(p, t)
            return State(name: nil, group: nil, lines: f.lines, rotation: 0)
        }
    }
}
