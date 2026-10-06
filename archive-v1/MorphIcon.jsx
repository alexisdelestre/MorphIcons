// MorphIcon.jsx
// -----------------------------------------------------------------------------
// Native React component (no custom element, no dependency other than React)
// for teams that would rather not reach for a web component. Same icon data
// and morph engine as morph-icon-element.js.
//
//   <MorphIcon icon="menu" size={24} duration={450} />
//
// Only the `icon` prop needs to change to trigger a morph — everything else
// (size, strokeWidth, color via CSS) can stay static or change freely.
// -----------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { SIZE } from './icons.js';
import { MorphController } from './engine.js';

export default function MorphIcon({
  icon,
  size = 24,
  duration = 450,
  strokeWidth = 2,
  linecap = 'round',
  color,
  className,
  style,
  ...rest
}) {
  const groupRef = useRef(null);
  const lineRefs = [useRef(null), useRef(null), useRef(null)];
  const controllerRef = useRef(null);
  const firstRenderRef = useRef(true);

  // Create the controller once, wired directly to the DOM (no React state /
  // re-render per animation frame — this is a 60fps loop).
  useEffect(() => {
    controllerRef.current = new MorphController((lines, rotation) => {
      if (groupRef.current) {
        groupRef.current.setAttribute('transform', `rotate(${rotation} ${SIZE / 2} ${SIZE / 2})`);
      }
      lines.forEach((l, i) => {
        const el = lineRefs[i].current;
        if (!el) return;
        el.setAttribute('x1', l.x1);
        el.setAttribute('y1', l.y1);
        el.setAttribute('x2', l.x2);
        el.setAttribute('y2', l.y2);
        el.setAttribute('opacity', l.opacity);
      });
    });
    controllerRef.current.set(icon);
    firstRenderRef.current = false;
    return () => controllerRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRenderRef.current) return; // already set on mount
    controllerRef.current?.morphTo(icon, { duration });
  }, [icon, duration]);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      fill="none"
      className={className}
      style={{ color, overflow: 'visible', ...style }}
      {...rest}
    >
      <g ref={groupRef}>
        {lineRefs.map((ref, i) => (
          <line
            key={i}
            ref={ref}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap={linecap}
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
}
