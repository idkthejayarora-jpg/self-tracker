import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff, Tag, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import api from '../lib/api';
import type { JournalEntry } from '../types';

// ── Web Speech API ────────────────────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; }
interface SpeechRecognitionInstance extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: Event) => void) | null;
  onend:    (() => void) | null;
}
declare const SpeechRecognition: new () => SpeechRecognitionInstance;
declare const webkitSpeechRecognition: new () => SpeechRecognitionInstance;

function useSpeech(onTranscript: (text: string) => void) {
  const ref = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [supported] = useState(() =>
    typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined'
  );
  const start = useCallback(() => {
    const Rec = typeof SpeechRecognition !== 'undefined' ? SpeechRecognition : webkitSpeechRecognition;
    const r = new Rec();
    r.lang = 'en-US'; r.continuous = true; r.interimResults = false;
    r.onresult = (e: SpeechRecognitionEvent) => {
      onTranscript(Array.from(e.results).slice(e.results.length - 1).map(x => x[0].transcript).join(''));
    };
    r.onerror = () => setListening(false);
    r.onend   = () => setListening(false);
    r.start(); ref.current = r; setListening(true);
  }, [onTranscript]);
  const stop = useCallback(() => { ref.current?.stop(); setListening(false); }, []);
  return { listening, supported, start, stop };
}

// ── Moods ─────────────────────────────────────────────────────────────────────
const MOODS = [
  { value: 1, label: 'CRITICAL',  color: '#ef4444', code: 'ERR_FATAL'   },
  { value: 2, label: 'DEGRADED',  color: '#f97316', code: 'PERF_LOW'    },
  { value: 3, label: 'NOMINAL',   color: '#eab308', code: 'STANDBY'     },
  { value: 4, label: 'OPTIMAL',   color: '#22c55e', code: 'SYS_ONLINE'  },
  { value: 5, label: 'OVERCLOCK', color: '#3b82f6', code: 'MAX_OUTPUT'  },
];


// ── Section label ─────────────────────────────────────────────────────────────
function NeonDivider({ label, color = 'rgb(var(--accent-rgb))' }: { label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-0.5 h-3.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color, opacity: 0.7 }}>
        {label.replace('_', ' ').replace('//', '').trim()}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Journal() {
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState('');
  const [mood, setMood]       = useState<number | null>(null);
  const [tags, setTags]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [recent, setRecent]   = useState<JournalEntry[]>([]);
  const [focused, setFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const appendTranscript = useCallback((text: string) => {
    setContent(prev => { const n = prev ? prev + ' ' + text : text; setCharCount(n.length); return n; });
    setSaved(false);
  }, []);
  const { listening, supported, start, stop } = useSpeech(appendTranscript);

  const loadEntry = useCallback(async (d: string) => {
    setSaved(false); setSaveErr('');
    try {
      const res = await api.get<JournalEntry>(`/journal/${d}`);
      const c = res.data.content ?? '';
      setContent(c); setCharCount(c.length);
      setMood(res.data.mood ?? null);
      setTags((JSON.parse(res.data.tags || '[]') as string[]).join(', '));
    } catch { setContent(''); setCharCount(0); setMood(null); setTags(''); }
  }, []);

  useEffect(() => { loadEntry(date); }, [date, loadEntry]);
  useEffect(() => {
    api.get<JournalEntry[]>('/journal?limit=10').then(r => setRecent(r.data)).catch(() => {});
  }, [saved]);

  async function save() {
    if (!content.trim()) return;
    setSaving(true); setSaveErr('');
    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.put(`/journal/${date}`, { content, mood, tags: parsedTags });
      setSaved(true); loadEntry(date);
    } catch (err: unknown) {
      setSaveErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'TRANSMISSION FAILED');
    } finally { setSaving(false); }
  }

  const goDay   = (d: number) => {
    const base = new Date(date + 'T00:00:00');
    setDate((d > 0 ? addDays : subDays)(base, Math.abs(d)).toISOString().slice(0, 10));
  };
  const isToday  = date === new Date().toISOString().slice(0, 10);
  const moodData = MOODS.find(m => m.value === mood);
  const accent   = moodData?.color ?? 'rgb(var(--accent-rgb))';

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page pb-10 px-1 sm:px-0">

      {/* ── Header ── */}
      <div className="page-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, background: '#a855f715', border: '1px solid #a855f725' }}>
            <BookOpen size={22} style={{ color: '#a855f7' }} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-head tracking-tight">Journal</h1>
            <p className="text-xs text-muted mt-0.5">
              {format(parseISO(date), 'EEE, dd MMM yyyy')}
              {moodData && <span className="ml-2" style={{ color: moodData.color }}>· {moodData.label}</span>}
            </p>
          </div>
        </div>
        {moodData && (
          <div className="w-8 h-8 rounded-full shrink-0"
            style={{ background: `${moodData.color}20`, border: `1.5px solid ${moodData.color}40` }}>
            <div className="w-full h-full rounded-full flex items-center justify-center">
              <span className="w-3.5 h-3.5 rounded-full block" style={{ background: moodData.color }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Date nav ── */}
      <div className="card px-4 py-2.5 flex items-center gap-3">
        <button onClick={() => goDay(-1)} className="tap p-2 rounded-lg"
          style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-muted)' }}>
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-bold text-head">
            {format(parseISO(date), 'EEE, dd MMM yyyy')}
          </p>
          <p className="text-[9px]" style={{ color: isToday ? accent : 'var(--t-faint)' }}>
            {isToday ? 'Today' : 'Past entry'}
          </p>
        </div>

        <button onClick={() => goDay(1)} disabled={isToday}
          className="tap p-2 rounded-lg disabled:opacity-20"
          style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-muted)' }}>
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="tap text-[10px] font-black px-3 py-1.5 rounded-lg"
            style={{ background: `${accent}12`, color: accent, border: `1px solid ${accent}28` }}>
            Today
          </button>
        )}
      </div>

      {/* ── Editor ── */}
      <div className="card overflow-hidden"
        style={{
          border: `1px solid ${focused ? accent + '35' : 'var(--b)'}`,
          transition: 'border-color 0.3s',
        }}>

        <div className="p-4 space-y-4">

          {/* ─ MOOD ─ */}
          <div>
            <NeonDivider label="STATUS_VECTOR" color={accent} />
            <div className="flex gap-2 flex-wrap mt-2.5">
              {MOODS.map(m => (
                <button key={m.value}
                  onClick={() => { setMood(mood === m.value ? null : m.value); setSaved(false); }}
                  className="tap flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl transition-all"
                  style={{
                    background: mood === m.value ? `${m.color}15` : 'var(--s2)',
                    border: `1px solid ${mood === m.value ? m.color + '45' : 'var(--b)'}`,
                    transform: mood === m.value ? 'scale(1.06)' : undefined,
                  }}>
                  <span className="w-4 h-4 rounded-full block" style={{ background: m.color }} />
                  <span className="text-[8px] font-black tracking-widest"
                    style={{ color: mood === m.value ? m.color : 'var(--t-faint)' }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ─ TEXTAREA ─ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <NeonDivider label="INPUT_STREAM" color={accent} />
              <span className="text-[9px] ml-3 shrink-0 tabular-nums text-muted">
                {charCount} chars
              </span>
            </div>
            <div className="relative">
              <textarea
                value={content}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={e => { setContent(e.target.value); setCharCount(e.target.value.length); setSaved(false); setSaveErr(''); }}
                rows={10}
                placeholder="Write your thoughts..."
                className="w-full rounded-xl px-3 py-3 text-sm resize-none leading-relaxed"
                style={{
                  paddingRight: supported ? '2.75rem' : '0.75rem',
                }}
              />
              {supported && (
                <button type="button" onClick={listening ? stop : start}
                  className="tap absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all"
                  style={listening
                    ? { background: `${accent}15`, color: accent, border: `1px solid ${accent}40` }
                    : { background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                  {listening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
            </div>
            {listening && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: accent }} />
                <span className="text-[10px]" style={{ color: accent }}>
                  Listening — speak your thoughts
                </span>
              </div>
            )}
          </div>

          {/* ─ TAGS ─ */}
          <div>
            <NeonDivider label="METADATA_TAGS" color={accent} />
            <div className="relative mt-2">
              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: accent, opacity: 0.4 }} />
              <input
                value={tags}
                onChange={e => { setTags(e.target.value); setSaved(false); }}
                placeholder="tag one, tag two, tag three..."
                className="w-full rounded-xl pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* ─ ERROR ─ */}
          {saveErr && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)' }}>
              <AlertCircle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
              <span className="text-[11px]" style={{ color: '#f87171' }}>{saveErr}</span>
            </div>
          )}

          {/* ─ SAVE ─ */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={saving || !content.trim()}
              className="tap flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
              style={saved
                ? { background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e35' }
                : { background: `${accent}12`, color: accent, border: `1px solid ${accent}28` }}>
              {saved
                ? <><CheckCircle2 size={14} /> Saved</>
                : saving
                  ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Saving…</>
                  : <><Save size={14} /> Save entry</>}
            </button>
            <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
              <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent entries ── */}
      {recent.filter(e => e.date !== date).length > 0 && (
        <div>
          <NeonDivider label="Recent entries" color="rgb(var(--accent-rgb))" />
          <div className="space-y-1.5 mt-3">
            {recent.filter(e => e.date !== date).slice(0, 5).map((e, i) => {
              const em = MOODS.find(m => m.value === e.mood);
              return (
                <button key={e.id} onClick={() => setDate(e.date)}
                  className="tap w-full card px-3 py-2.5 text-left transition-all group relative overflow-hidden"
                  style={{ borderLeft: em?.color ? `3px solid ${em.color}40` : undefined }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted tabular-nums">{i + 1}.</span>
                      <span className="text-xs font-bold text-head">
                        {format(parseISO(e.date), 'EEE, dd MMM')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {em && <span className="text-[8px] font-bold" style={{ color: em.color }}>{em.label}</span>}
                      {em && <span className="w-3 h-3 rounded-full inline-block" style={{ background: em.color }} />}
                    </div>
                  </div>
                  <p className="text-[11px] mt-0.5 line-clamp-1 pl-6 text-muted">{e.content}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
