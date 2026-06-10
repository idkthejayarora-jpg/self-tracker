export type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking';

// The JARVIS-style orb. Big animated circle that reacts to conversation state.
export default function AxisOrb({
  state, color = '#d9a066', size = 240, onTap,
}: {
  state: OrbState;
  color?: string;
  size?: number;
  onTap?: () => void;
}) {
  const listening = state === 'listening';
  const speaking  = state === 'speaking';
  const thinking  = state === 'thinking';

  return (
    <div
      onClick={onTap}
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size, cursor: onTap ? 'pointer' : 'default' }}>

      {/* Outer ripples — pulse outward while listening */}
      {listening && (
        <div className="absolute inset-0" style={{ color }}>
          <span className="axis-ripple" />
          <span className="axis-ripple axis-ripple-2" />
          <span className="axis-ripple axis-ripple-3" />
        </div>
      )}

      {/* Rotating outer ring */}
      <div className="absolute rounded-full axis-rotate"
        style={{
          inset: 0,
          border: `1px solid ${color}30`,
          borderTopColor: `${color}aa`,
          borderRightColor: `${color}55`,
        }} />
      {/* Counter-rotating inner ring */}
      <div className="absolute rounded-full axis-rotate-rev"
        style={{
          inset: size * 0.12,
          border: `1px solid ${color}22`,
          borderBottomColor: `${color}88`,
        }} />

      {/* Glowing core */}
      <div
        className={`rounded-full ${speaking ? 'axis-speaking' : thinking ? '' : 'axis-breathe'}`}
        style={{
          width: size * 0.62,
          height: size * 0.62,
          background: `${color}cc`,
          boxShadow: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>

        {/* Inner content by state */}
        {speaking && (
          <div className="flex items-end gap-1.5" style={{ height: size * 0.22 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} className="axis-eq-bar"
                style={{
                  height: '100%',
                  background: '#fff',
                  opacity: 0.9,
                  animationDelay: `${i * 0.11}s`,
                  animationDuration: `${0.42 + (i % 3) * 0.12}s`,
                }} />
            ))}
          </div>
        )}

        {listening && (
          <div className="flex items-center justify-center gap-[3px]" style={{ height: size * 0.2 }}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <span key={i} className="waveform-bar"
                style={{ height: '100%', background: '#fff', opacity: 0.85, animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        )}

        {thinking && (
          <span className="rounded-full axis-rotate"
            style={{ width: size * 0.24, height: size * 0.24, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff' }} />
        )}

        {state === 'idle' && (
          <span className="font-black tracking-[0.3em]" style={{ color: '#fff', fontSize: size * 0.09, opacity: 0.85, textShadow: 'none' }}>
            JAY
          </span>
        )}
      </div>
    </div>
  );
}
