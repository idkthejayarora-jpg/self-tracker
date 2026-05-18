import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, RefreshCw, CheckCircle2, Clock, ChevronRight, Zap } from 'lucide-react';
import api from '../lib/api';

interface ParsedGoal {
  title:  string;
  icon:   string;
  bucket: 'hours' | 'days' | 'weeks' | 'months' | 'years';
  note:   string | null;
  label:  string;   // e.g. "Quick Win"
  color:  string;
  bg:     string;
  desc:   string;
}

const PLACEHOLDERS = [
  `I want to learn German because I plan to move to Berlin someday. I also want to get in shape — ideally lose 10kg and be able to run a 5K without dying. I've always wanted to write a book, even just a short one. I want to build a startup around a product I've been sketching out. Also want to get better at drawing and maybe learn guitar. Investing is something I keep putting off — need to just start. And I want to read at least 20 books this year.`,
  `I want to become fluent in Japanese. I want to start my own agency and go freelance. Build a morning routine, fix my sleep, and start meditating. I want to eventually own a flat and move to a bigger city. Also learn Python and maybe build a small SaaS on the side.`,
];

export default function LifeProgress() {
  const [rawText, setRawText] = useState('');
  const [goals, setGoals] = useState<ParsedGoal[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [addingGoal, setAddingGoal] = useState<string | null>(null);
  const [addedGoals, setAddedGoals] = useState<Set<string>>(new Set());
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load saved ambitions on mount
  const loadSaved = useCallback(async () => {
    try {
      const r = await api.get<{ raw_text: string; goals: ParsedGoal[] }>('/life/ambitions');
      if (r.data.raw_text) setRawText(r.data.raw_text);
      if (r.data.goals?.length) setGoals(r.data.goals);
    } catch (_) {}
    setLoaded(true);
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function parse() {
    if (!rawText.trim() || loading) return;
    setLoading(true);
    try {
      const r = await api.post<{ goals: ParsedGoal[]; summary: string }>('/life/ambitions/parse', { text: rawText });
      setGoals(r.data.goals);
      setSummary(r.data.summary || '');
    } catch (_) {
      setSummary('Something went wrong. Try again.');
    }
    setLoading(false);
  }

  async function addToMissions(goal: ParsedGoal) {
    setAddingGoal(goal.title);
    try {
      await api.post('/tasks', {
        title: goal.title,
        priority: goal.bucket === 'hours' || goal.bucket === 'days' ? 'medium'
                : goal.bucket === 'weeks' ? 'medium'
                : goal.bucket === 'months' ? 'high'
                : 'high',
        notes: goal.note ?? goal.desc,
      });
      setAddedGoals(s => new Set([...s, goal.title]));
    } catch (_) {}
    setAddingGoal(null);
  }

  const byBucket = goals.reduce((acc, g) => {
    if (!acc[g.bucket]) acc[g.bucket] = [];
    acc[g.bucket].push(g);
    return acc;
  }, {} as Record<string, ParsedGoal[]>);

  const bucketOrder = (['hours','days','weeks','months','years'] as const).filter(b => byBucket[b]?.length);

  const BUCKET_ICONS: Record<string, string> = {
    hours: '⚡', days: '📅', weeks: '📆', months: '🗓️', years: '🏔️',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 anim-page pb-10"
      style={{ '--accent-rgb': '168 85 247' } as React.CSSProperties}>

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, var(--hero-bg) 65%)', border: '1px solid #a855f730', minHeight: 110 }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #a855f710 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
        {/* Corner brackets */}
        {[['top-0 left-0','borderTop borderLeft'],['top-0 right-0','borderTop borderRight'],['bottom-0 left-0','borderBottom borderLeft'],['bottom-0 right-0','borderBottom borderRight']].map(([pos, borders]) => (
          <div key={pos} className={`absolute ${pos} pointer-events-none`}
            style={{ width: 14, height: 14, ...Object.fromEntries(borders.split(' ').map(b => [b, '1.5px solid #a855f7'])), opacity: 0.6 }} />
        ))}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #a855f780, transparent)', boxShadow: '0 0 12px #a855f7' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#a855f7', opacity: 0.7 }}>PATH://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">LIFE_TRAJECTORY</span>
            <span className="cursor-blink font-mono" style={{ color: '#a855f7', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: '0 0 40px #a855f760' }}>
            LIFE PATH
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#a855f7', opacity: 0.5 }}>
            // WHERE YOU'RE HEADED — WRITE IT DOWN, MAKE IT REAL
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #a855f740, transparent)' }} />
      </div>

      {/* ── INPUT SECTION ── */}
      <div className="space-y-4" style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-1.5" style={{ color: 'var(--t-faint)' }}>
            // Write about where you're headed
          </p>
          <p className="text-sm mb-3" style={{ color: 'var(--t-muted)' }}>
            Tell it everything — languages you want to learn, habits to build, things to create, places to go, who you want to become. Write like you're talking to yourself.
          </p>
        </div>

        <div className="relative">
          <textarea
            ref={taRef}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={8}
            placeholder={PLACEHOLDERS[0]}
            className="w-full rounded-2xl px-4 py-4 text-sm resize-none focus:outline-none leading-relaxed"
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--b)',
              color: 'var(--t-body)',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f760'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--b)'; }}
          />
          <div className="absolute bottom-3 right-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            {rawText.length > 0 ? `${rawText.split(/\s+/).filter(Boolean).length} words` : 'write freely'}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={parse}
            disabled={!rawText.trim() || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white tap disabled:opacity-40 transition-all"
            style={{ background: 'rgb(var(--accent-rgb))' }}>
            {loading
              ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Analysing...</>
              : <><Zap size={14} /> Parse my path</>
            }
          </button>

          {goals.length > 0 && (
            <button onClick={parse} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
              <RefreshCw size={11} /> Re-analyse
            </button>
          )}

          {!rawText && loaded && (
            <button
              onClick={() => { setRawText(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]); taRef.current?.focus(); }}
              className="text-xs tap" style={{ color: 'var(--t-faint)' }}>
              See example
            </button>
          )}
        </div>
      </div>

      {/* ── RESULTS ── */}
      {goals.length > 0 && (
        <div className="space-y-7" style={{ position: 'relative', zIndex: 1 }}>

          {/* Summary line */}
          {summary && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ background: 'rgb(var(--accent-rgb) / 0.07)', border: '1px solid rgb(var(--accent-rgb) / 0.18)' }}>
              <Zap size={14} className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--accent-rgb-light))' }} />
              <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{summary}</p>
            </div>
          )}

          {/* Goals grouped by bucket */}
          {bucketOrder.map(bucket => {
            const groupGoals = byBucket[bucket];
            const meta = groupGoals[0]; // grab color/label from first item (same bucket)
            return (
              <div key={bucket}>
                {/* Bucket header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{BUCKET_ICONS[bucket]}</span>
                  <span className="text-xs font-black tracking-widest uppercase"
                    style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>— {meta.desc}</span>
                  <div className="flex-1 h-px ml-1" style={{ background: `${meta.color}25` }} />
                  <span className="text-[10px] font-bold font-mono" style={{ color: meta.color }}>
                    {groupGoals.length}
                  </span>
                </div>

                {/* Goal cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {groupGoals.map(goal => {
                    const added = addedGoals.has(goal.title);
                    const adding = addingGoal === goal.title;
                    return (
                      <div key={goal.title}
                        className="rounded-2xl px-4 py-4 flex flex-col gap-2.5 group"
                        style={{
                          background: 'var(--s1)',
                          border: `1px solid ${goal.color}25`,
                          borderLeft: `3px solid ${goal.color}`,
                        }}>
                        {/* Top row */}
                        <div className="flex items-start gap-3">
                          <span className="text-2xl shrink-0 leading-none mt-0.5">{goal.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-snug" style={{ color: 'var(--t-head)' }}>
                              {goal.title}
                            </p>
                            {/* Bucket badge */}
                            <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full mt-1"
                              style={{ background: goal.bg, color: goal.color }}>
                              {goal.label}
                            </span>
                          </div>
                        </div>

                        {/* Note */}
                        {goal.note && (
                          <p className="text-[11px] leading-relaxed flex items-start gap-1.5"
                            style={{ color: 'var(--t-faint)' }}>
                            <Clock size={10} className="shrink-0 mt-0.5" />
                            {goal.note}
                          </p>
                        )}

                        {/* Add to missions */}
                        <button
                          onClick={() => !added && addToMissions(goal)}
                          disabled={adding || added}
                          className="flex items-center gap-1.5 text-[11px] font-bold tap self-start px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-60"
                          style={{
                            background: added ? '#22c55e15' : `${goal.color}12`,
                            color: added ? '#22c55e' : goal.color,
                            border: `1px solid ${added ? '#22c55e30' : `${goal.color}30`}`,
                          }}>
                          {adding
                            ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                            : added
                            ? <CheckCircle2 size={11} />
                            : <Plus size={11} />
                          }
                          {adding ? 'Adding...' : added ? 'Added to Missions' : 'Add to Missions'}
                          {!adding && !added && <ChevronRight size={10} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {loaded && goals.length === 0 && !loading && rawText.trim() === '' && (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">🗺️</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--t-muted)' }}>Your path starts here</p>
          <p className="text-xs" style={{ color: 'var(--t-faint)' }}>Write about your ambitions above and hit Parse</p>
        </div>
      )}

    </div>
  );
}
