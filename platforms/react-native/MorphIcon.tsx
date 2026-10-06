// MorphIcon.tsx — React Native component for Morph Icons.
// -----------------------------------------------------------------------------
// Requires react-native-svg (npx expo install react-native-svg, or
// npm i react-native-svg + pod install).
//
// Copy these 3 files into the same folder of your app:
//   MorphIcon.tsx       (this file)
//   morph-core.ts       (core/morph-core.ts — the engine, shared with React web)
//   morph-icons.json    (the icon data, owned by the designers)
//
//   <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel="Menu">
//     <MorphIcon name={open ? 'cross' : 'menu'} color="#111" />
//   </Pressable>
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line } from 'react-native-svg';
import { MorphDriver, frameOf, restState, type Frame, type MorphData } from './morph-core';
import iconData from './morph-icons.json';

const DEFAULT_DATA = iconData as unknown as MorphData;

/** Icon names come straight from the JSON: adding an icon updates the type. */
export type MorphIconName = keyof typeof iconData.icons;

export interface MorphIconProps {
  /** Icon to display. Changing it animates. */
  name: MorphIconName | (string & {});
  /** Width and height in dp. Default 24. */
  size?: number;
  /** Stroke color. Default '#000'. */
  color?: string;
  /** Transition duration in ms. Default: the JSON's `duration`. 0 = no animation. */
  duration?: number;
  /** Stroke width in viewBox units. Default: the JSON's `strokeWidth`. */
  strokeWidth?: number;
  /** Other icon data (tests, A/B). Default: ./morph-icons.json. */
  data?: MorphData;
  style?: StyleProp<ViewStyle>;
}

export default function MorphIcon({
  name,
  size = 24,
  color = '#000',
  duration,
  strokeWidth,
  data = DEFAULT_DATA,
  style,
}: MorphIconProps) {
  // 3 lines re-rendered per frame: cheap enough that Reanimated isn't needed.
  const [frame, setFrame] = useState<Frame>(() => frameOf(restState(data, name)));
  const driverRef = useRef<MorphDriver | null>(null);
  const dataRef = useRef(data);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const driver = new MorphDriver(dataRef.current, name, setFrame);
    driverRef.current = driver;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      driver.dispose();
      sub.remove();
    };
    // Created once; `name` and `data` changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dataRef.current === data) return;
    dataRef.current = data;
    driverRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    driverRef.current?.go(name, reduceMotion.current ? 0 : (duration ?? data.duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const c = data.viewBox / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${data.viewBox} ${data.viewBox}`} style={style}>
      <G rotation={frame.rotation} origin={`${c}, ${c}`}>
        {frame.lines.map((s, i) => (
          <Line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={color}
            strokeOpacity={s.o}
            strokeWidth={strokeWidth ?? data.strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}
