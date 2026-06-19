import { Lock } from 'lucide-react';

// ── Rank card finishes — escalating premium look per rank ─────────────────────
// Each finish layers on top of a base card: a border, a glow, and (for the upper
// ranks) an animated foil / holographic / aurora overlay.

export type RankTierKey = 'kraft' | 'bronze' | 'iron' | 'silver' | 'gold' | 'crimson' | 'obsidian' | 'aurora';

export interface RankFinish {
  name: string;              // finish display name
  premium: number;           // 0–7 — how fancy
  border: string;
  shadow: string;
  /** absolutely-positioned overlay rendered behind content */
  overlay?: { className?: string; style: React.CSSProperties };
  /** diagonal light streak that sweeps across (gold+) */
  sweep?: boolean;
}

export function getRankFinish(tier: string, color: string): RankFinish {
  switch (tier as RankTierKey) {
    case 'aurora':
      return {
        name: 'Aurora', premium: 7,
        border: `2px solid ${color}aa`,
        shadow: `0 24px 70px ${color}3a, 0 0 0 1px ${color}55, inset 0 0 40px ${color}22`,
        sweep: true,
        overlay: {
          className: 'aurora-foil',
          style: {
            background: `linear-gradient(125deg, ${color}40 0%, #e08b4e33 22%, #c2553d33 42%, #e8a87c40 62%, #d9a06633 82%, ${color}40 100%)`,
            mixBlendMode: 'screen', opacity: 0.7,
          },
        },
      };
    case 'obsidian':
      return {
        name: 'Holographic', premium: 6,
        border: `2px solid ${color}88`,
        shadow: `0 22px 60px rgba(0,0,0,0.55), 0 0 0 1px ${color}44, inset 0 0 30px ${color}1a`,
        sweep: true,
        overlay: {
          className: 'holo-foil',
          style: {
            background: `linear-gradient(115deg, ${color}33 0%, #e8a87c2e 25%, #cf8a3e2e 50%, #c2553d2e 75%, ${color}33 100%)`,
            mixBlendMode: 'screen', opacity: 0.55,
          },
        },
      };
    case 'crimson':
      return {
        name: 'Crimson foil', premium: 5,
        border: `2px solid ${color}77`,
        shadow: `0 20px 52px ${color}30, 0 0 0 1px ${color}33`,
        sweep: true,
        overlay: { style: { background: `radial-gradient(120% 80% at 50% 0%, ${color}22, transparent 60%)`, opacity: 1 } },
      };
    case 'gold':
      return {
        name: 'Gold foil', premium: 4,
        border: `2px solid ${color}66`,
        shadow: `0 18px 46px ${color}2a, 0 0 0 1px ${color}2e`,
        sweep: true,
        overlay: { style: { background: `radial-gradient(120% 80% at 50% 0%, ${color}1e, transparent 58%)`, opacity: 1 } },
      };
    case 'silver':
      return {
        name: 'Silver foil', premium: 3,
        border: `1.5px solid ${color}55`,
        shadow: `0 14px 38px rgba(0,0,0,0.4), 0 0 0 1px ${color}22`,
        overlay: { style: { background: `linear-gradient(160deg, rgba(255,255,255,0.07), transparent 45%)`, opacity: 1 } },
      };
    case 'iron':
      return {
        name: 'Iron plate', premium: 2,
        border: `1.5px solid ${color}44`,
        shadow: `0 12px 32px rgba(0,0,0,0.38)`,
        overlay: { style: { background: `linear-gradient(160deg, ${color}10, transparent 50%)`, opacity: 1 } },
      };
    case 'bronze':
      return {
        name: 'Bronze edge', premium: 1,
        border: `1.5px solid ${color}40`,
        shadow: `0 10px 28px rgba(0,0,0,0.34)`,
      };
    case 'kraft':
    default:
      return {
        name: 'Kraft', premium: 0,
        border: `1px solid rgba(255,255,255,0.08)`,
        shadow: `0 8px 22px rgba(0,0,0,0.28)`,
      };
  }
}

// ── Small reusable rank-card chrome (border + glow + foil overlay) ────────────
export function RankFinishLayer({ finish }: { finish: RankFinish }) {
  return (
    <>
      {finish.overlay && (
        <div className={`absolute inset-0 pointer-events-none ${finish.overlay.className ?? ''}`}
          style={{ ...finish.overlay.style, zIndex: 1, borderRadius: 'inherit' }} />
      )}
      {finish.sweep && (
        <div className="absolute inset-0 pointer-events-none foil-sweep overflow-hidden" style={{ zIndex: 2, borderRadius: 'inherit' }} />
      )}
    </>
  );
}

interface LadderRank {
  rank: string; cls: string; min: number; color: string;
  tier: string; label: string; desc: string; perks: string[];
}

// ── The rank ladder — every rank as its own premium card ──────────────────────
export function RankLadder({ ranks, currentRank, merit }: { ranks: LadderRank[]; currentRank: string; merit: number }) {
  // ranks come low → high; show high → low so the apex sits on top
  const ordered = [...ranks].reverse();
  return (
    <div className="space-y-2.5">
      {ordered.map(r => {
        const finish = getRankFinish(r.tier, r.color);
        const unlocked = merit >= r.min;
        const isCurrent = r.rank === currentRank;
        return (
          <div key={r.rank}
            className="relative overflow-hidden rounded-2xl transition-all"
            style={{
              border: finish.border,                          // foil/metal edge shows on every rank
              boxShadow: isCurrent ? finish.shadow : 'none',  // only your rank gets the full glow
              background: 'var(--s1)',
              opacity: unlocked ? 1 : 0.78,                   // locked ranks dimmed but visible (aspirational)
            }}>
            {/* finish overlay on every rank so you can see what you're climbing toward */}
            <RankFinishLayer finish={finish} />

            <div className="relative flex items-center gap-3.5 px-4 py-3.5" style={{ zIndex: 3 }}>
              {/* Rank glyph chip */}
              <div className="shrink-0 flex flex-col items-center justify-center rounded-xl"
                style={{
                  width: 54, height: 54,
                  background: unlocked ? `${r.color}1c` : 'var(--s3)',
                  border: `1.5px solid ${unlocked ? r.color + '66' : 'var(--b)'}`,
                  color: unlocked ? r.color : 'var(--t-faint)',
                }}>
                <span className="font-black leading-none" style={{ fontSize: 22, fontFamily: "'Lora', Georgia, serif" }}>{r.rank}</span>
                <span className="text-[7px] font-bold tracking-[0.12em] mt-0.5 opacity-70">{r.cls.toUpperCase()}</span>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: unlocked ? 'var(--t-head)' : 'var(--t-muted)', fontFamily: "'Lora', Georgia, serif" }}>
                    {r.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[8px] font-black tracking-[0.14em] px-1.5 py-0.5 rounded-full"
                      style={{ background: r.color, color: '#1a1714' }}>YOU ARE HERE</span>
                  )}
                  {!unlocked && (
                    <span className="text-[9px] flex items-center gap-0.5" style={{ color: 'var(--t-faint)' }}>
                      <Lock size={9} /> {r.min} merit
                    </span>
                  )}
                </div>
                {/* Perks */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.perks.map((p, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md"
                      style={{
                        background: unlocked ? `${r.color}14` : 'var(--s3)',
                        color: unlocked ? r.color : 'var(--t-faint)',
                        border: `1px solid ${unlocked ? r.color + '2a' : 'transparent'}`,
                      }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Finish name */}
              <span className="shrink-0 text-[8px] font-bold tracking-[0.14em] uppercase self-start"
                style={{ color: unlocked ? r.color : 'var(--t-faint)', opacity: 0.7 }}>
                {finish.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
