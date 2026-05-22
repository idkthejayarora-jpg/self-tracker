import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  right?: React.ReactNode;
}

/**
 * Shared clean page header — warm paper in light, forest dark in dark.
 * No neon, no HUD corners. Just type + icon + optional right slot.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'rgb(var(--accent-rgb))',
  right,
}: PageHeaderProps) {
  return (
    <div className="page-header flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div
            className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{
              width: 44,
              height: 44,
              background: `${iconColor}15`,
              border: `1px solid ${iconColor}28`,
            }}
          >
            <Icon size={22} style={{ color: iconColor }} strokeWidth={1.7} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-head tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs font-medium mt-0.5 text-muted truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
