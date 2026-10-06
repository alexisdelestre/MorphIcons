// MorphIcon.swift — SwiftUI component for Morph Icons (iOS 15+ / macOS 12+).
// -----------------------------------------------------------------------------
// Change `name` and the icon morphs to the new one. Interruptible: changing it
// mid-transition restarts from what is on screen, with no jump (same behavior
// as MorphDriver in core/morph-core.ts). Needs MorphCore.swift and, for the
// default `data`, morph-icons.json in the app bundle ("Copy Bundle Resources").
//
//     @State private var open = false
//
//     Button { open.toggle() } label: {
//         MorphIcon(open ? "cross" : "menu")
//     }
//     .accessibilityLabel(open ? "Close menu" : "Open menu")
//     .foregroundStyle(.primary)   // the icon strokes with the foreground style
// -----------------------------------------------------------------------------

import SwiftUI

public struct MorphIcon: View {
    private let name: String
    private let size: CGFloat
    private let duration: Double?
    private let data: MorphData

    @StateObject private var model = MorphIconModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// - Parameters:
    ///   - name: Icon to show (a key of `icons` in morph-icons.json).
    ///   - size: Width and height, in points.
    ///   - duration: Transition length in seconds; nil = the JSON's `duration`.
    ///     Reduce Motion turns transitions into instant swaps.
    ///   - data: Icon set; defaults to morph-icons.json from the main bundle.
    public init(_ name: String, size: CGFloat = 24, duration: Double? = nil, data: MorphData = .shared) {
        self.name = name
        self.size = size
        self.duration = duration
        self.data = data
    }

    public var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: !model.isAnimating)) { context in
            // Computed outside the Canvas closure so it is read on the main actor.
            let frame = currentFrame(at: context.date)
            Canvas { gc, _ in
                draw(frame, in: &gc)
            }
        }
        .frame(width: size, height: size)
        .onAppear { model.set(name, data: data) }
        .onChange(of: name) { newName in
            model.go(to: newName, duration: reduceMotion ? 0 : (duration ?? data.duration / 1000), data: data)
        }
    }

    /// At rest, draw the resting state (never the paused timeline's stale date).
    /// Before `onAppear` has run, fall back to the icon's own resting state.
    private func currentFrame(at date: Date) -> Morph.Frame? {
        if let frame = model.frame(at: date) { return frame }
        return (try? Morph.restState(data, name)).map(Morph.frameOf)
    }

    private func draw(_ frame: Morph.Frame?, in gc: inout GraphicsContext) {
        guard let frame = frame else { return }
        let scale = size / CGFloat(data.viewBox)
        let center = size / 2
        // Rotation around the center. y points down, so a positive angle turns
        // clockwise, as in SVG and in the JSON.
        gc.translateBy(x: center, y: center)
        gc.rotate(by: .degrees(frame.rotation))
        gc.translateBy(x: -center, y: -center)
        let style = StrokeStyle(lineWidth: CGFloat(data.strokeWidth) * scale, lineCap: .round)
        for seg in frame.lines where seg.o > 0 {
            var path = Path()
            path.move(to: CGPoint(x: CGFloat(seg.x1) * scale, y: CGFloat(seg.y1) * scale))
            path.addLine(to: CGPoint(x: CGFloat(seg.x2) * scale, y: CGFloat(seg.y2) * scale))
            var line = gc // a copy: its opacity doesn't leak to the next line
            line.opacity = seg.o
            line.stroke(path, with: .foreground, style: style)
        }
    }
}

/// Animation state of one MorphIcon: the SwiftUI counterpart of MorphDriver.
/// Time comes from the TimelineView; this only remembers what is running.
@MainActor
final class MorphIconModel: ObservableObject {
    /// Shown when nothing is animating.
    @Published private(set) var rest: Morph.State?
    /// The running transition (meaningful only while `isAnimating`).
    @Published private(set) var current: Morph.Plan?
    @Published private(set) var isAnimating = false
    private var start = Date()
    private var duration: Double = 0
    /// Bumped on every set/go, so a finish scheduled by an interrupted
    /// transition recognizes it is stale and does nothing.
    private var token = 0

    nonisolated init() {}

    /// Icon currently shown, or being animated to.
    var target: String? {
        isAnimating ? current?.end.name : rest?.name
    }

    /// Jump to an icon with no animation.
    func set(_ name: String, data: MorphData) {
        token += 1
        isAnimating = false
        current = nil
        do {
            rest = try Morph.restState(data, name)
        } catch {
            assertionFailure("MorphIcon: \(error)")
        }
    }

    /// Animate to an icon. `duration` in seconds; 0 = instant.
    func go(to name: String, duration: Double, data: MorphData, now: Date = Date()) {
        if name == target { return }
        guard let from = liveState(at: now), duration > 0 else {
            set(name, data: data)
            return
        }
        let plan: Morph.Plan
        do {
            plan = try Morph.plan(data, from, name)
        } catch {
            assertionFailure("MorphIcon: \(error)")
            return // keep the current animation or resting state
        }
        token += 1
        let token = self.token
        rest = from
        current = plan
        start = now
        self.duration = duration
        isAnimating = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            guard let self = self, self.token == token else { return }
            self.finish()
        }
    }

    /// What to draw at `date`, or nil before the first `set`.
    func frame(at date: Date) -> Morph.Frame? {
        if isAnimating, let plan = current {
            return Morph.frameAt(plan, progress(at: date))
        }
        return rest.map(Morph.frameOf)
    }

    private func finish() {
        guard let plan = current else { return }
        rest = plan.end
        current = nil
        isAnimating = false
    }

    private func progress(at date: Date) -> Double {
        min(1, max(0, date.timeIntervalSince(start) / duration))
    }

    /// Where a new transition starts from: mid-flight state if animating.
    private func liveState(at date: Date) -> Morph.State? {
        if isAnimating, let plan = current {
            return Morph.stateAt(plan, progress(at: date))
        }
        return rest
    }
}
