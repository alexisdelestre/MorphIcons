// MorphIcon.tsx — React (web) component for Morph Icons.
// -----------------------------------------------------------------------------
// Copy these 3 files into the same folder of your app:
//   MorphIcon.tsx       (this file)
//   morph-core.ts       (core/morph-core.ts — the engine, shared with React Native)
//   morph-icons.json    (the icon data, owned by the designers)
//
//   <MorphIcon name={open ? 'cross' : 'menu'} />
//
// Changing `name` animates to the new icon (interruptible). The color is
// `currentColor`: set it with CSS `color`. Requires `resolveJsonModule` in
// tsconfig (on by default with Vite, Next.js, CRA).
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState, type SVGProps } from 'react';
import { MorphDriver, frameOf, restState, type Frame, type MorphData } from './morph-core';
import iconData from './morph-icons.json';

const DEFAULT_DATA = iconData as unknown as MorphData;

/** Icon names come straight from the JSON: adding an icon updates the type. */
export type MorphIconName = keyof typeof iconData.icons;

export interface MorphIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref' | 'children'> {
  /** Icon to display. Changing it animates. */
  name: MorphIconName | (string & {});
  /** Width and height (number = px). Default 24. */
  size?: number | string;
  /** Transition duration in ms. Default: the JSON's `duration`. 0 = no animation. */
  duration?: number;
  /** Stroke width in viewBox units. Default: the JSON's `strokeWidth`. */
  strokeWidth?: number;
  /** Accessible label. Without it the icon is decorative (aria-hidden). */
  title?: string;
  /** Other icon data (tests, A/B). Default: ./morph-icons.json. */
  data?: MorphData;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export default function MorphIcon({
  name,
  size = 24,
  duration,
  strokeWidth,
  title,
  data = DEFAULT_DATA,
  style,
  ...svgProps
}: MorphIconProps) {
  const groupRef = useRef<SVGGElement>(null);
  const lineRefs = useRef<(SVGLineElement | null)[]>([null, null, null]);
  const driverRef = useRef<MorphDriver | null>(null);
  const dataRef = useRef(data);

  // First paint (and SSR) shows the icon directly. These props never change
  // afterwards, so React never overwrites what the driver paints.
  const [initial] = useState<Frame>(() => frameOf(restState(data, name)));
  const c = data.viewBox / 2;

  useEffect(() => {
    // Writes the DOM directly at 60 fps: no React render per frame.
    const paint = (f: Frame) => {
      groupRef.current?.setAttribute('transform', `rotate(${f.rotation} ${c} ${c})`);
      f.lines.forEach((s, i) => {
        const el = lineRefs.current[i];
        if (!el) return;
        el.setAttribute('x1', String(s.x1));
        el.setAttribute('y1', String(s.y1));
        el.setAttribute('x2', String(s.x2));
        el.setAttribute('y2', String(s.y2));
        el.setAttribute('opacity', String(s.o));
      });
    };
    const driver = new MorphDriver(dataRef.current, name, paint);
    driverRef.current = driver;
    return () => driver.dispose();
    // Created once; `name` and `data` changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dataRef.current === data) return;
    dataRef.current = data;
    driverRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    driverRef.current?.go(name, prefersReducedMotion() ? 0 : (duration ?? data.duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <svg
      viewBox={`0 0 ${data.viewBox} ${data.viewBox}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? data.strokeWidth}
      strokeLinecap="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      style={{ overflow: 'visible', ...style }}
      {...svgProps}
    >
      {title ? <title>{title}</title> : null}
      <g ref={groupRef} transform={`rotate(${initial.rotation} ${c} ${c})`}>
        {initial.lines.map((s, i) => (
          <line
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            opacity={s.o}
          />
        ))}
      </g>
    </svg>
  );
}
