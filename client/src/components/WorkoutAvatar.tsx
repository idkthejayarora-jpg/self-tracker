import { Zap, Dumbbell, Trophy, Flame, Star, Award } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface WorkoutStats {
  weekly_sessions: number;
  total_sets: number;
  personal_bests: number;
}

interface Buff {
  id: string;
  Icon: LucideIcon;
  label: string;
  description: string;
  color: string;
}

function getBuffs(stats: WorkoutStats): Buff[] {
  const buffs: Buff[] = [];

  if (stats.weekly_sessions >= 5) {
    buffs.push({ id: 'beast', Icon: Zap, label: 'Beast Mode', description: '5+ sessions this week', color: '#f43f5e' });
  } else if (stats.weekly_sessions >= 3) {
    buffs.push({ id: 'strong', Icon: Dumbbell, label: 'Strong', description: '3+ sessions this week', color: '#f97316' });
  } else if (stats.weekly_sessions >= 1) {
    buffs.push({ id: 'active', Icon: Zap, label: 'Active', description: 'Working out this week', color: '#eab308' });
  }

  if (stats.personal_bests >= 3) {
    buffs.push({ id: 'record', Icon: Trophy, label: 'Record Breaker', description: `${stats.personal_bests} personal bests`, color: '#f59e0b' });
  }

  if (stats.total_sets >= 50) {
    buffs.push({ id: 'grind', Icon: Flame, label: 'Grinder', description: `${stats.total_sets} sets logged`, color: '#ef4444' });
  } else if (stats.total_sets >= 20) {
    buffs.push({ id: 'consistent', Icon: Star, label: 'Consistent', description: `${stats.total_sets} sets logged`, color: '#a78bfa' });
  }

  return buffs;
}

function getAvatarTier(sessions: number): { body: string; aura: string; label: string } {
  if (sessions >= 5) return { body: '#f43f5e', aura: 'rgba(244,63,94,0.25)', label: 'Champion' };
  if (sessions >= 3) return { body: '#f97316', aura: 'rgba(249,115,22,0.2)', label: 'Warrior' };
  if (sessions >= 1) return { body: '#a78bfa', aura: 'rgba(167,139,250,0.18)', label: 'Fighter' };
  return { body: '#6b7280', aura: 'rgba(107,114,128,0.1)', label: 'Rookie' };
}

export default function WorkoutAvatar({ stats }: { stats: WorkoutStats }) {
  const buffs = getBuffs(stats);
  const tier = getAvatarTier(stats.weekly_sessions);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-5">
        {/* Avatar SVG */}
        <div className="relative shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
            <circle cx="44" cy="44" r="40" fill={tier.aura} />
            <circle cx="44" cy="22" r="10" fill={tier.body} opacity="0.9" />
            <path d="M44 32 C40 40 38 50 37 58" stroke={tier.body} strokeWidth="5" strokeLinecap="round" opacity="0.9"/>
            <path d="M42 36 C34 30 28 26 25 22" stroke={tier.body} strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
            <path d="M46 36 C54 30 60 26 63 22" stroke={tier.body} strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
            <path d="M37 58 C34 66 32 72 30 78" stroke={tier.body} strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
            <path d="M37 58 C40 66 44 72 46 78" stroke={tier.body} strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
            <circle cx="24" cy="21" r="4" fill={tier.body} opacity="0.8"/>
            <circle cx="64" cy="21" r="4" fill={tier.body} opacity="0.8"/>
            {stats.weekly_sessions >= 3 && (
              <>
                <circle cx="44" cy="6" r="2" fill="#fbbf24" opacity="0.9"/>
                <circle cx="36" cy="9" r="1.5" fill="#fbbf24" opacity="0.7"/>
                <circle cx="52" cy="9" r="1.5" fill="#fbbf24" opacity="0.7"/>
              </>
            )}
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-lg font-bold text-head">{tier.label}</span>
            <span className="text-xs text-muted">· this week</span>
          </div>
          <div className="text-xs text-muted space-y-0.5 mb-3">
            <p>{stats.weekly_sessions} session{stats.weekly_sessions !== 1 ? 's' : ''}</p>
            <p>{stats.total_sets} total sets</p>
            {stats.personal_bests > 0 && (
              <p className="flex items-center gap-1">
                <Award size={11} style={{ color: '#f59e0b' }} />
                {stats.personal_bests} personal best{stats.personal_bests !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Buffs */}
          {buffs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {buffs.map(b => (
                <span
                  key={b.id}
                  title={b.description}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: b.color + '22', color: b.color, border: `1px solid ${b.color}44` }}
                >
                  <b.Icon size={10} /> {b.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs italic" style={{ color: 'var(--t-faint)' }}>Log a session to unlock buffs</p>
          )}
        </div>
      </div>
    </div>
  );
}
