import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import api from '../lib/api';

/* ── Types ─────────────────────────────────────────────────────── */
interface LifeArea {
  id: number; name: string; icon: string; color: string;
  displayScore: number; autoScore: number | null;
  taskStats: { total: number; done: number };
  journalMentions: number;
  milestones: { completed: number }[];
}
interface MeStats {
  strength: number; vitality: number; discipline: number;
  focus: number; endurance: number; wealth: number;
}
interface MeSummary {
  rank: string; rankColor: string; rankLabel: string;
  meritScore: number; totalPoints: number; stats: MeStats;
}
interface LevelData {
  total: number; level: number; levelLabel: string;
  progressPct: number; nextLevel: number | null;
  today: number; thisWeek: number;
}

/* ── Custom Tooltip ─────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-head)', minWidth: 120 }}>
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-black">{p.value}{typeof p.value === 'number' && p.value <= 100 ? '%' : ''}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────── */
function StatTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col justify-center"
      style={{ background: 'var(--s1)', border: `1px solid ${color}25` }}>
      <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>{label}</div>
      <div className="text-2xl font-black font-mono tabular-nums leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] mt-1 font-mono" style={{ color: 'var(--t-faint)' }}>{sub}</div>}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────── */
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <p className="text-[9px] font-black tracking-[0.25em]" style={{ color: 'var(--accent, #e2c97e)', opacity: 0.7 }}>
        // {title}
      </p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>{sub}</p>}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function LifeProgress() {
  const [areas, setAreas]   = useState<LifeArea[]>([]);
  const [me, setMe]         = useState<MeSummary | null>(null);
  const [lvl, setLvl]       = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);

  const gold = '#e2c97e';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [areasRes, meRes, lvlRes] = await Promise.allSettled([
      api.get<LifeArea[]>('/life/areas'),
      api.get<MeSummary>('/me/summary'),
      api.get<LevelData>('/points'),
    ]);
    if (areasRes.status === 'fulfilled') setAreas(areasRes.value.data);
    if (meRes.status   === 'fulfilled') setMe(meRes.value.data);
    if (lvlRes.status  === 'fulfilled') setLvl(lvlRes.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Derived chart data ── */
  const avgScore = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.displayScore, 0) / areas.length) : 0;

  // Sector scores chart
  const sectorData = areas.map(a => ({
    name: `${a.icon} ${a.name.split(' ')[0]}`,
    fullName: a.name,
    score: a.displayScore,
    tasks: a.taskStats.total > 0 ? Math.round((a.taskStats.done / a.taskStats.total) * 100) : 0,
    journal: Math.min(100, a.journalMentions * 8),
    color: a.color,
  }));

  // Task completion per sector (only areas with tasks)
  const taskData = areas
    .filter(a => a.taskStats.total > 0)
    .map(a => ({
      name: `${a.icon} ${a.name.split(' ')[0]}`,
      done: a.taskStats.done,
      total: a.taskStats.total,
      pct: Math.round((a.taskStats.done / a.taskStats.total) * 100),
      color: a.color,
    }));

  // Global stats chart
  const statsData = me ? [
    { name: 'Strength',   value: me.stats.strength,   color: '#ef4444' },
    { name: 'Vitality',   value: me.stats.vitality,   color: '#22c55e' },
    { name: 'Discipline', value: me.stats.discipline, color: '#f97316' },
    { name: 'Focus',      value: me.stats.focus,      color: '#a855f7' },
    { name: 'Endurance',  value: me.stats.endurance,  color: '#0ea5e9' },
    { name: 'Wealth',     value: me.stats.wealth,     color: '#f59e0b' },
  ] : [];

  // Radar data for sectors (if enough areas)
  const radarData = areas.map(a => ({
    subject: `${a.icon} ${a.name.split(/[\s&]/)[0]}`,
    score: a.displayScore,
    fullMark: 100,
  }));

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center space-y-2">
        <div className="text-2xl animate-pulse">⚡</div>
        <p className="text-xs font-mono" style={{ color: 'var(--t-faint)' }}>loading life data...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5"
      style={{ '--accent-rgb': '226 201 126' } as React.CSSProperties}>

      {/* Dot grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(226,201,126,0.05) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
      </div>

      <div className="relative space-y-5" style={{ zIndex: 1 }}>

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-2xl"
          style={{ background: 'var(--hero-bg)', border: `1px solid ${gold}20`, minHeight: 110 }}>
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{ position: 'absolute', top: -20, right: 60, width: 2, height: 200,
              background: `linear-gradient(180deg, transparent, ${gold}40, transparent)`, transform: 'rotate(20deg)' }} />
            <div style={{ position: 'absolute', top: -20, right: 90, width: 1, height: 200,
              background: `linear-gradient(180deg, transparent, ${gold}20, transparent)`, transform: 'rotate(20deg)' }} />
          </div>
          {(['tl','tr','bl','br'] as const).map(c => (
            <div key={c} className="absolute pointer-events-none" style={{
              top: c[0]==='t' ? 0 : 'auto', bottom: c[0]==='b' ? 0 : 'auto',
              left: c[1]==='l' ? 0 : 'auto', right: c[1]==='r' ? 0 : 'auto',
              width: 12, height: 12, opacity: 0.6,
              borderTop: c[0]==='t' ? `1.5px solid ${gold}` : 'none',
              borderBottom: c[0]==='b' ? `1.5px solid ${gold}` : 'none',
              borderLeft: c[1]==='l' ? `1.5px solid ${gold}` : 'none',
              borderRight: c[1]==='r' ? `1.5px solid ${gold}` : 'none',
            }} />
          ))}
          <div className="absolute top-0 inset-x-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${gold}60, transparent)` }} />
          <div className="relative z-10 px-5 py-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: gold, opacity: 0.6 }}>SYS://</span>
              <span className="text-[9px] font-mono tracking-widest" style={{ color: 'var(--t-faint)' }}>LIFE_OVERVIEW.ANALYSIS</span>
              <span className="font-mono animate-pulse" style={{ color: gold, fontSize: 11 }}>▌</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight leading-none"
              style={{ color: '#fff', textShadow: `0 0 30px ${gold}50` }}>LIFE PATH</h1>
            <p className="font-mono text-[10px] mt-1" style={{ color: '#a78bfa', opacity: 0.7 }}>
              // sector analysis — tasks · habits · activity · journal
            </p>
          </div>
        </div>

        {/* ── TOP STAT ROW ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="OVERALL SCORE" value={`${avgScore}%`} sub={`across ${areas.length} sectors`} color={gold} />
          {me && <StatTile label="HUNTER RANK" value={me.rank} sub={me.rankLabel} color={me.rankColor} />}
          {lvl && <StatTile label="LEVEL" value={lvl.level} sub={`${lvl.levelLabel} · ${lvl.progressPct}% to next`} color={gold} />}
          {lvl && <StatTile label="TOTAL XP" value={lvl.total.toLocaleString()} sub={`+${lvl.today} today · +${lvl.thisWeek} this week`} color="#22c55e" />}
        </div>

        {/* ── SECTOR SCORES ── */}
        {sectorData.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <SectionHead title="SECTOR SCORES" sub="auto-computed from tasks · keywords · habits · journal" />
            <ResponsiveContainer width="100%" height={Math.max(180, sectorData.length * 42)}>
              <BarChart data={sectorData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--t-faint)', fontSize: 9 }}
                  tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'var(--t-muted)', fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {sectorData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── TASK COMPLETION PER SECTOR + RADAR side by side on desktop ── */}
        <div className="grid gap-4 md:grid-cols-2">

          {/* Task completion bars */}
          {taskData.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <SectionHead title="TASK COMPLETION" sub="done / total per sector" />
              <ResponsiveContainer width="100%" height={Math.max(160, taskData.length * 44)}>
                <BarChart data={taskData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--t-faint)', fontSize: 9 }}
                    tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={76} tick={{ fill: 'var(--t-muted)', fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    formatter={(v: any, _: any, props: any) => [`${props.payload.done}/${props.payload.total} tasks (${v}%)`, 'Completion']} />
                  <Bar dataKey="pct" name="Done" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {taskData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {taskData.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: 'var(--t-faint)' }}>
                  Tag tasks to life areas to see breakdown
                </p>
              )}
            </div>
          )}

          {/* Radar chart — sectors */}
          {radarData.length >= 3 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <SectionHead title="SECTOR RADAR" sub="balance across life domains" />
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--t-muted)', fontSize: 9 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke={gold} fill={gold} fillOpacity={0.15} strokeWidth={1.5} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── GLOBAL STATS ── */}
        {statsData.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <SectionHead title="LIVE STATS" sub="strength · vitality · discipline · focus · endurance · wealth" />
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statsData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--t-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--t-faint)', fontSize: 9 }}
                  tickFormatter={v => `${v}`} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" name="Score" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {statsData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[8px] font-mono text-center mt-1" style={{ color: 'var(--t-faint)' }}>
              workouts · sleep quality · habit rate · task rate · streak · finance net
            </p>
          </div>
        )}

        {/* ── JOURNAL ACTIVITY ── */}
        {areas.some(a => a.journalMentions > 0) && (
          <div className="rounded-xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <SectionHead title="JOURNAL SIGNAL" sub="keyword mentions in last 30 days per sector" />
            <ResponsiveContainer width="100%" height={Math.max(140, areas.filter(a => a.journalMentions > 0).length * 40)}>
              <BarChart
                data={areas.filter(a => a.journalMentions > 0).sort((a, b) => b.journalMentions - a.journalMentions).map(a => ({
                  name: `${a.icon} ${a.name.split(' ')[0]}`,
                  mentions: a.journalMentions,
                  color: a.color,
                }))}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--t-faint)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={76} tick={{ fill: 'var(--t-muted)', fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  formatter={(v: any) => [`${v} mentions`, 'Journal']} />
                <Bar dataKey="mentions" name="Mentions" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {areas.filter(a => a.journalMentions > 0).map((a, i) => (
                    <Cell key={i} fill={a.color} opacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── SECTOR TABLE (raw numbers) ── */}
        {areas.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <div className="px-4 pt-4 pb-2">
              <SectionHead title="SECTOR BREAKDOWN" sub="all signals at a glance" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--b)' }}>
                    {['Sector', 'Score', 'Tasks', 'Journal', 'Milestones'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-black tracking-wider text-[9px]"
                        style={{ color: 'var(--t-faint)' }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...areas].sort((a, b) => b.displayScore - a.displayScore).map((a, i) => {
                    const msDone = a.milestones.filter(m => m.completed).length;
                    const taskPct = a.taskStats.total > 0
                      ? Math.round((a.taskStats.done / a.taskStats.total) * 100) : null;
                    return (
                      <tr key={a.id} style={{ borderBottom: i < areas.length - 1 ? '1px solid var(--b)' : 'none' }}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                            <span style={{ color: 'var(--t-head)' }}>{a.icon} {a.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-black font-mono" style={{ color: a.color }}>{a.displayScore}%</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {taskPct !== null
                            ? <span className="font-mono" style={{ color: 'var(--t-muted)' }}>{a.taskStats.done}/{a.taskStats.total} ({taskPct}%)</span>
                            : <span style={{ color: 'var(--t-faint)' }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {a.journalMentions > 0
                            ? <span style={{ color: '#a855f7' }}>×{a.journalMentions}</span>
                            : <span style={{ color: 'var(--t-faint)' }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {a.milestones.length > 0
                            ? <span className="font-mono" style={{ color: 'var(--t-muted)' }}>{msDone}/{a.milestones.length}</span>
                            : <span style={{ color: 'var(--t-faint)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {areas.length === 0 && !loading && (
          <div className="rounded-xl py-16 text-center" style={{ border: '1px dashed var(--b)' }}>
            <div className="text-4xl mb-3">📊</div>
            <p className="font-semibold" style={{ color: 'var(--t-muted)' }}>No sectors yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--t-faint)' }}>Add life areas to see your analysis</p>
          </div>
        )}

      </div>
    </div>
  );
}
