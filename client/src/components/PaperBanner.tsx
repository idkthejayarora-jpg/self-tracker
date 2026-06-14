import type { LucideIcon } from 'lucide-react';

interface PaperBannerProps {
  title: string;
  subtitle?: string;
  label?: string;       // small stamp text above title
  accent?: string;      // hex color
  icon?: LucideIcon;
  right?: React.ReactNode;
  children?: React.ReactNode; // extra content below title row (e.g. ticker)
}

export default function PaperBanner({
  title,
  subtitle,
  label,
  accent = 'rgb(var(--accent-rgb))',
  icon: Icon,
  right,
  children,
}: PaperBannerProps) {
  return (
    <div className="paper-banner">
      <div className="flex items-start justify-between gap-4">
        {/* Left: icon + text */}
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div
              className="shrink-0 flex items-center justify-center paper-grain"
              style={{
                width: 48, height: 48,
                borderRadius: '15px 10px 13px 15px / 12px 15px 10px 13px',
                background: `${accent}14`,
                border: `1.5px solid ${accent}28`,
              }}
            >
              <Icon size={24} style={{ color: accent, position: 'relative', zIndex: 1 }} strokeWidth={1.6} />
            </div>
          )}
          <div className="min-w-0">
            {label && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-[2px] w-6 rounded-full" style={{ background: accent, opacity: 0.45 }} />
                <span style={{
                  color: accent,
                  opacity: 0.55,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  fontFamily: "'Lora', Georgia, serif",
                }}>
                  {label}
                </span>
                <div className="h-[2px] flex-1 rounded-full" style={{ background: accent, opacity: 0.15 }} />
              </div>
            )}
            <h1
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: '1.85rem',
                fontWeight: 700,
                color: 'var(--t-head)',
                lineHeight: 1,
                letterSpacing: '-0.022em',
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p style={{
                color: 'var(--t-faint)',
                fontSize: 11,
                marginTop: 5,
                letterSpacing: '0.03em',
                fontStyle: 'italic',
              }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && (
        <div className="mt-3">{children}</div>
      )}
    </div>
  );
}
