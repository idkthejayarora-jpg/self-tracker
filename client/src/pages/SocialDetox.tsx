import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, Shield, Flame, Check } from 'lucide-react';
import api from '../lib/api';

interface DetoxApp {
  id: number;
  name: string;
  icon: string;
  color: string;
  daily_limit_minutes: number;
  log: { status: string; minutes_used: number; note: string } | null;
}
interface StreakData { app_id: number; name: string; icon: string; color: string; streak: number; longest: number; }

const APP_PRESETS = [
  { name: 'Instagram', icon: '📸', color: '#e1306c' },
  { name: 'TikTok',    icon: '🎵', color: '#000000' },
  { name: 'X / Twitter', icon: '🐦', color: '#1da1f2' },
  { name: 'YouTube',   icon: '▶️', color: '#ff0000' },
  { name: 'Reddit',    icon: '🤖', color: '#ff4500' },
  { name: 'LinkedIn',  icon: '💼', color: '#0077b5' },
  { name: 'Snapchat',  icon: '👻', color: '#fffc00' },
  { name: 'WhatsApp',  icon: '💬', color: '#25d366' },
];
const COLORS = ['#6366f1','#a855f7','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9','#e1306c'];

export default function SocialDetox() {
  const [apps, setApps]       = useState<DetoxApp[]>([]);
  const [streaks, setStreaks]  = useState<StreakData[]>([]);
  const [showAdd, setShowAdd]  = useState(false);
  const [newName, setNewName]  = useState('');
  const [newIcon, setNewIcon]  = useState('📱');
  const [newColor, setNewColor]= useState('#6366f1');
  const [newLimit, setNewLimit]= useState('0');

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      api.get<DetoxApp[]>('/detox/today'),
      api.get<StreakData[]>('/detox/streaks'),
    ]);
    setApps(a.data);
    setStreaks(s.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function checkIn(appId: number, status: 'clean' | 'slipped') {
    await api.put(`/detox/log/${appId}`, { status });
    load();
  }

  async function addApp() {
    if (!newName.trim()) return;
    await api.post('/detox/apps', { name: newName, icon: newIcon, color: newColor, daily_limit_minutes: Number(newLimit) });
    setShowAdd(false); setNewName(''); setNewIcon('📱'); setNewColor('#6366f1'); setNewLimit('0');
    load();
  }

  async function deleteApp(id: number) {
    await api.delete(`/detox/apps/${id}`);
    load();
  }

  function fillPreset(p: typeof APP_PRESETS[0]) {
    setNewName(p.name); setNewIcon(p.icon); setNewColor(p.color);
  }

  const cleanCount = apps.filter(a => a.log?.status === 'clean').length;
  const score = apps.length > 0 ? Math.round((cleanCount / apps.length) * 100) : 0;
  const streakMap = Object.fromEntries(streaks.map(s => [s.app_id, s]));

  return (
    <div className="max-w-xl space-y-4 anim-page"
      style={{ '--accent-rgb': '244 63 94' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(244,63,94,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── FIREWALL HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #f43f5e25', minHeight: 110 }}>
        {/* Corrupted pixel noise */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06 }}>
          {[...Array(6)].map((_,i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${i * 17}%`, top: `${20 + (i%3)*20}%`,
              width: 40, height: 6,
              background: i%2===0 ? '#f43f5e' : '#8b5cf6',
              animation: `glitch-block 5s step-end ${i*700}ms infinite`,
            }} />
          ))}
        </div>
        {/* Diagonal warning stripe */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(244,63,94,0.02) 20px, rgba(244,63,94,0.02) 22px)',
        }} />
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #f43f5e', borderLeft: '1.5px solid #f43f5e', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #f43f5e', borderRight: '1.5px solid #f43f5e', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #f43f5e', borderLeft: '1.5px solid #f43f5e', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #f43f5e', borderRight: '1.5px solid #f43f5e', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #f43f5e80, transparent)', boxShadow: '0 0 8px #f43f5e' }} />
        <div className="relative z-10 px-5 py-5" style={{ animation: 'glitch-block 8s step-end 2s infinite' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#f43f5e', opacity: 0.7 }}>BLOCK://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">FIREWALL_ACTIVE</span>
            <span className="cursor-blink font-mono" style={{ color: '#f43f5e', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white" style={{ textShadow: '0 0 30px #f43f5e50' }}>
            DIGITAL DETOX
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#8b5cf6', opacity: 0.6 }}>
            // neural firewall engaged — signal blocking protocol
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #f43f5e30, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex justify-end">
        <button onClick={() => setShowAdd(s => !s)}
          className="tap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
          <Plus size={13} /> Add app
        </button>
      </div>

      {/* Score card */}
      {apps.length > 0 && (
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Shield size={14} style={{ color: score === 100 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444' }} />
              <span className="text-sm font-semibold text-head">Today's Detox Score</span>
            </div>
            <span className="text-xl font-bold" style={{ color: score === 100 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444' }}>
              {score}%
            </span>
          </div>
          <div className="h-1.5 rounded-full w-full" style={{ background: 'var(--s3)' }}>
            <div className="h-1.5 rounded-full bar-fill"
              style={{ width: `${score}%`, background: score === 100 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444' }} />
          </div>
          <p className="text-[11px] mt-2" style={{ color: '#52525b' }}>
            {cleanCount}/{apps.length} apps clean today
          </p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card px-4 py-4 space-y-3 scale-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-head">Track an app</span>
            <button onClick={() => setShowAdd(false)} style={{ color: '#52525b' }}><X size={15} /></button>
          </div>
          {/* Presets */}
          <div>
            <p className="text-[11px] mb-2" style={{ color: 'var(--t-dim)' }}>Quick add</p>
            <div className="flex flex-wrap gap-2">
              {APP_PRESETS.map(p => (
                <button key={p.name} onClick={() => fillPreset(p)}
                  className="tap flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{ background: newName === p.name ? p.color + '22' : 'var(--s2)', color: newName === p.name ? p.color : '#a1a1aa', border: `1px solid ${newName === p.name ? p.color + '44' : 'var(--b)'}` }}>
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="App name"
            className="w-full px-3 py-2 rounded-lg text-sm text-head focus:outline-none focus:ring-1"
            style={{ background: 'var(--s2)', border: '1px solid var(--b)', focusRingColor: 'rgb(var(--accent-rgb))' } as React.CSSProperties} />
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <p className="text-[11px] mb-1.5" style={{ color: 'var(--t-dim)' }}>Daily limit (min, 0 = full detox)</p>
              <input type="number" min={0} value={newLimit} onChange={e => setNewLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-head focus:outline-none"
                style={{ background: 'var(--s2)', border: '1px solid var(--b)' }} />
            </div>
            <div>
              <p className="text-[11px] mb-1.5" style={{ color: 'var(--t-dim)' }}>Color</p>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} className="w-5 h-5 rounded-full tap"
                    style={{ background: c, outline: newColor === c ? `2px solid #f4f4f5` : 'none', outlineOffset: '2px' }} />
                ))}
              </div>
            </div>
          </div>
          <button onClick={addApp} disabled={!newName.trim()}
            className="tap w-full py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ background: 'rgb(var(--accent-rgb))', color: '#fff' }}>
            Start tracking
          </button>
        </div>
      )}

      {/* App cards */}
      {apps.length === 0 && !showAdd && (
        <div className="card px-4 py-12 text-center space-y-3">
          <p className="text-3xl">📵</p>
          <p className="text-sm font-semibold text-head">No apps tracked yet</p>
          <p className="text-xs" style={{ color: 'var(--t-dim)' }}>Add apps you want to limit or avoid</p>
        </div>
      )}

      <div className="space-y-2">
        {apps.map(app => {
          const streakData = streakMap[app.id];
          const isClean   = app.log?.status === 'clean';
          const isSlipped = app.log?.status === 'slipped';
          const isLogged  = app.log?.status === 'logged';
          void isLogged;
          return (
            <div key={app.id} className="card px-4 py-3 tap" style={{ borderLeft: `3px solid ${app.color}` }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{app.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-head">{app.name}</span>
                    {streakData && streakData.streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: app.color + '18', color: app.color }}>
                        <Flame size={9} /> {streakData.streak}d
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: '#52525b' }}>
                    {app.daily_limit_minutes === 0 ? 'Full detox' : `Limit: ${app.daily_limit_minutes}m`}
                    {streakData && streakData.longest > 0 && ` · best ${streakData.longest}d`}
                  </p>
                </div>

                {/* Check-in buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => checkIn(app.id, 'clean')}
                    className="tap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: isClean ? '#22c55e22' : 'var(--s2)',
                      color: isClean ? '#22c55e' : '#71717a',
                      border: `1px solid ${isClean ? '#22c55e44' : 'var(--b)'}`,
                    }}>
                    <Check size={11} /> Clean
                  </button>
                  <button onClick={() => checkIn(app.id, 'slipped')}
                    className="tap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: isSlipped ? '#ef444422' : 'var(--s2)',
                      color: isSlipped ? '#ef4444' : '#71717a',
                      border: `1px solid ${isSlipped ? '#ef444444' : 'var(--b)'}`,
                    }}>
                    ✗
                  </button>
                  <button onClick={() => deleteApp(app.id)}
                    className="tap p-1.5 rounded-lg transition-colors"
                    style={{ color: '#3f3f46' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ef4444'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#3f3f46'}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Slip indicator */}
              {isSlipped && (
                <div className="mt-2 text-[11px] px-2 py-1 rounded-md"
                  style={{ background: '#ef444410', color: '#f87171' }}>
                  Slipped today — tomorrow is a fresh start 🙏
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Streak board */}
      {streaks.some(s => s.streak > 0) && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--accent-rgb))' }}>// STREAK BOARD</p>
          <div className="space-y-2.5">
            {streaks.filter(s => s.streak > 0).sort((a,b) => b.streak - a.streak).map(s => (
              <div key={s.app_id} className="flex items-center gap-3">
                <span className="text-base leading-none">{s.icon}</span>
                <span className="text-sm text-body flex-1">{s.name}</span>
                <div className="flex-1 h-1 rounded-full mx-2" style={{ background: 'var(--s3)', maxWidth: 80 }}>
                  <div className="h-1 rounded-full bar-fill"
                    style={{ width: `${Math.min(100,(s.streak/Math.max(s.longest,1))*100)}%`, background: s.color }} />
                </div>
                <span className="text-xs font-bold" style={{ color: s.color }}>{s.streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
