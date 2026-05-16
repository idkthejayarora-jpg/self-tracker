import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import api from '../lib/api';
import type { JournalEntry } from '../types';

// ── Web Speech API types ───────────────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
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
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [supported] = useState(() =>
    typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined'
  );
  const start = useCallback(() => {
    const Rec = typeof SpeechRecognition !== 'undefined' ? SpeechRecognition : webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).slice(e.results.length - 1).map(r => r[0].transcript).join('');
      onTranscript(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    rec.start(); recognitionRef.current = rec; setListening(true);
  }, [onTranscript]);
  const stop = useCallback(() => { recognitionRef.current?.stop(); setListening(false); }, []);
  return { listening, supported, start, stop };
}

// ── Mood config ────────────────────────────────────────────────────────────────
const MOODS = [
  { value: 1, emoji: '😞', label: 'CRITICAL',  color: '#ef4444', code: 'SYS_FAIL'    },
  { value: 2, emoji: '😕', label: 'DEGRADED',  color: '#f97316', code: 'LOW_PERF'    },
  { value: 3, emoji: '😐', label: 'NOMINAL',   color: '#f59e0b', code: 'STANDBY'     },
  { value: 4, emoji: '🙂', label: 'OPTIMAL',   color: '#22c55e', code: 'ONLINE'      },
  { value: 5, emoji: '😄', label: 'OVERCLOCK', color: '#00f5ff', code: 'MAX_OUTPUT'  },
];

// ── HUD corner brackets ────────────────────────────────────────────────────────
function HudCorners({ color = '#00f5ff', size = 16 }: { color?: string; size?: number }) {
  const s = `${size}px`;
  const b = `1.5px solid ${color}`;
  return (
    <>
      <div className="absolute top-0 left-0"   style={{ width: s, height: s, borderTop: b, borderLeft:  b, opacity: 0.7 }} />
      <div className="absolute top-0 right-0"  style={{ width: s, height: s, borderTop: b, borderRight: b, opacity: 0.7 }} />
      <div className="absolute bottom-0 left-0"  style={{ width: s, height: s, borderBottom: b, borderLeft:  b, opacity: 0.7 }} />
      <div className="absolute bottom-0 right-0" style={{ width: s, height: s, borderBottom: b, borderRight: b, opacity: 0.7 }} />
    </>
  );
}

// ── Scrolling data column ──────────────────────────────────────────────────────
const DATA_STREAM = ['01001101', '11010010', '00110101', '10110001', '01101110',
  '11001010', '00011111', '10100011', '01110100', '00001010', '11111010', '01010101'];

function DataStream() {
  return (
    <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none overflow-hidden"
      style={{ opacity: 0.06 }}>
      <div style={{ animation: 'data-scroll 12s linear infinite', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...DATA_STREAM, ...DATA_STREAM].map((d, i) => (
          <span key={i} className="font-mono text-[8px] text-right pr-1 block"
            style={{ color: '#00f5ff' }}>{d}</span>
        ))}
      </div>
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
    setContent(prev => {
      const next = prev ? prev + ' ' + text : text;
      setCharCount(next.length);
      return next;
    });
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
      const parsedTags: string[] = JSON.parse(res.data.tags || '[]');
      setTags(parsedTags.join(', '));
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
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'TRANSMISSION FAILED — retry';
      setSaveErr(msg);
    } finally { setSaving(false); }
  }

  const goDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    setDate((delta > 0 ? addDays : subDays)(d, Math.abs(delta)).toISOString().slice(0, 10));
  };

  const isToday   = date === new Date().toISOString().slice(0, 10);
  const moodData  = MOODS.find(m => m.value === mood);
  const accentC   = moodData?.color ?? '#00f5ff';

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-page pb-10 px-1 sm:px-0">

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl px-5 py-4"
        style={{
          background: 'var(--s1)',
          border: `1px solid ${accentC}30`,
          boxShadow: `0 0 30px ${accentC}12, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}>
        <HudCorners color={accentC} size={14} />
        <DataStream />

        {/* Scan strip */}
        <div className="absolute left-0 right-0 h-[2px] pointer-events-none overflow-hidden"
          style={{ top: '50%', zIndex: 0, opacity: 0.08 }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(90deg, transparent, ${accentC}, transparent)`,
            animation: 'hud-scan 3s linear infinite',
          }} />
        </div>

        <div className="relative flex items-center justify-between gap-3 z-10">
          <div>
            {/* System label */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[9px] font-black tracking-[0.3em] cyber-flicker"
                style={{ color: accentC, opacity: 0.7 }}>SYS //</span>
              <span className="text-[9px] font-mono tracking-widest"
                style={{ color: 'var(--t-faint)' }}>NEURAL_LOG v2.7</span>
              <span className="cursor-blink text-[10px] font-mono"
                style={{ color: accentC }}>▌</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-head">
              JOURNAL
              <span className="text-[11px] font-mono ml-2 align-middle"
                style={{ color: accentC, textShadow: `0 0 8px ${accentC}` }}>
                [{isToday ? 'LIVE' : 'ARCHIVE'}]
              </span>
            </h1>
          </div>

          {/* Mood status */}
          {moodData ? (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <span className="text-3xl">{moodData.emoji}</span>
              <span className="text-[9px] font-black tracking-widest"
                style={{ color: moodData.color, textShadow: `0 0 8px ${moodData.color}` }}>
                {moodData.code}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5 shrink-0 opacity-30">
              <span className="text-2xl font-mono" style={{ color: '#00f5ff' }}>?</span>
              <span className="text-[9px] font-black tracking-widest" style={{ color: '#00f5ff' }}>NO_DATA</span>
            </div>
          )}
        </div>
      </div>

      {/* ── DATE NAVIGATION ── */}
      <div className="relative rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
        <HudCorners color="#00f5ff" size={10} />

        <button onClick={() => goDay(-1)} className="tap p-2 rounded-lg transition-all"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}>
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-mono font-semibold tracking-wider text-head">
            {format(parseISO(date), 'EEE, dd MMM yyyy').toUpperCase()}
          </p>
          <p className="text-[10px] font-mono" style={{ color: accentC, opacity: 0.7 }}>
            {isToday ? '>> TODAY <<' : format(parseISO(date), 'yyyy-MM-dd')}
          </p>
        </div>

        <button onClick={() => goDay(1)} disabled={isToday}
          className="tap p-2 rounded-lg transition-all disabled:opacity-25"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}>
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="tap text-[10px] font-black tracking-widest px-3 py-1.5 rounded-lg"
            style={{
              background: '#00f5ff10',
              color: '#00f5ff',
              border: '1px solid #00f5ff30',
              textShadow: '0 0 8px #00f5ff',
            }}>
            &gt;&gt; NOW
          </button>
        )}
      </div>

      {/* ── EDITOR CARD ── */}
      <div className="relative rounded-2xl p-4 space-y-4 overflow-hidden"
        style={{
          background: 'var(--s1)',
          border: `1px solid ${focused ? accentC + '50' : 'var(--b)'}`,
          boxShadow: focused ? `0 0 24px ${accentC}15, 0 0 60px ${accentC}08` : 'none',
          transition: 'all 0.3s',
        }}>
        <HudCorners color={accentC} size={14} />

        {/* Faint vertical scan over editor */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" style={{ zIndex: 0 }}>
          <div className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${accentC}04 3px, ${accentC}04 4px)`,
            }} />
        </div>

        {/* ── MOOD ROW ── */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accentC}40, transparent)` }} />
            <span className="text-[9px] font-black tracking-[0.25em]"
              style={{ color: accentC, opacity: 0.7 }}>STATUS_VECTOR</span>
            <div className="h-px flex-1" style={{ background: `linear-gradient(270deg, ${accentC}40, transparent)` }} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {MOODS.map(m => (
              <button key={m.value}
                onClick={() => { setMood(mood === m.value ? null : m.value); setSaved(false); }}
                title={m.label}
                className="tap flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all"
                style={{
                  background: mood === m.value ? `${m.color}15` : 'var(--s3)',
                  border: `1px solid ${mood === m.value ? m.color + '60' : 'var(--b)'}`,
                  boxShadow: mood === m.value ? `0 0 12px ${m.color}40, inset 0 0 8px ${m.color}10` : 'none',
                  transform: mood === m.value ? 'scale(1.1)' : undefined,
                }}>
                <span className="text-xl">{m.emoji}</span>
                <span className="text-[8px] font-black tracking-widest"
                  style={{ color: mood === m.value ? m.color : 'var(--t-faint)' }}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── TEXTAREA ── */}
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black tracking-[0.25em]"
              style={{ color: accentC, opacity: 0.6 }}>INPUT_STREAM</span>
            <span className="text-[9px] font-mono tabular-nums"
              style={{ color: charCount > 0 ? accentC : 'var(--t-faint)', opacity: 0.6 }}>
              {charCount.toString().padStart(4, '0')} BYTES
            </span>
          </div>
          <div className="relative">
            <textarea
              value={content}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={e => {
                setContent(e.target.value);
                setCharCount(e.target.value.length);
                setSaved(false); setSaveErr('');
              }}
              rows={10}
              placeholder="// begin neural transmission..."
              className="w-full rounded-xl px-3 py-3 text-sm resize-none leading-relaxed focus:outline-none font-mono transition-all placeholder:opacity-30"
              style={{
                background: 'var(--s2)',
                color: 'var(--t-body)',
                border: listening
                  ? '1.5px solid #ff009060'
                  : `1.5px solid ${focused ? accentC + '50' : 'var(--b)'}`,
                paddingRight: supported ? '2.75rem' : '0.75rem',
                caretColor: accentC,
              }}
            />
            {/* Character glow line at top of textarea */}
            {focused && (
              <div className="absolute top-0 left-4 right-4 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${accentC}60, transparent)` }} />
            )}
            {supported && (
              <button
                type="button"
                onClick={listening ? stop : start}
                title={listening ? 'Stop' : 'Speak'}
                className="tap absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all"
                style={listening
                  ? { background: '#ff009020', color: '#ff0090', border: '1px solid #ff009060',
                      boxShadow: '0 0 12px #ff009060', animation: 'neon-pulse 1s ease-in-out infinite' }
                  : { background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}
          </div>
          {listening && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: '#ff0090', boxShadow: '0 0 6px #ff0090', animation: 'neon-pulse 0.8s ease-in-out infinite' }} />
              <span className="text-[10px] font-mono" style={{ color: '#ff0090' }}>
                REC // NEURAL AUDIO CAPTURE ACTIVE
              </span>
            </div>
          )}
        </div>

        {/* ── TAGS ── */}
        <div className="relative z-10">
          <span className="text-[9px] font-black tracking-[0.25em] block mb-1"
            style={{ color: accentC, opacity: 0.6 }}>METADATA_TAGS</span>
          <div className="relative">
            <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: accentC, opacity: 0.5 }} />
            <input
              value={tags}
              onChange={e => { setTags(e.target.value); setSaved(false); }}
              placeholder="tag_one, tag_two, tag_three..."
              className="w-full rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none font-mono placeholder:opacity-30"
              style={{
                background: 'var(--s2)',
                color: 'var(--t-body)',
                border: '1.5px solid var(--b)',
                caretColor: accentC,
              }}
            />
          </div>
        </div>

        {/* ── ERROR BANNER ── */}
        {saveErr && (
          <div className="relative z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-mono"
            style={{ background: '#ff009010', border: '1px solid #ff009040', color: '#ff0090' }}>
            <AlertCircle size={13} />
            <span className="text-[11px]">ERROR // {saveErr}</span>
          </div>
        )}

        {/* ── SAVE BUTTON ── */}
        <div className="relative z-10 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="tap flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black tracking-widest transition-all disabled:opacity-35"
            style={saved
              ? {
                  background: '#22c55e15',
                  color: '#22c55e',
                  border: '1px solid #22c55e50',
                  boxShadow: '0 0 20px #22c55e40',
                  textShadow: '0 0 8px #22c55e',
                }
              : {
                  background: `${accentC}12`,
                  color: accentC,
                  border: `1px solid ${accentC}40`,
                  boxShadow: `0 0 16px ${accentC}30`,
                  textShadow: `0 0 8px ${accentC}`,
                }}>
            {saved ? (
              <><CheckCircle2 size={14} /> UPLOADED</>
            ) : saving ? (
              <><span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> TRANSMITTING…</>
            ) : (
              <><Save size={14} /> UPLOAD</>
            )}
          </button>

          {/* Word/char count display */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--t-faint)' }}>
              {content.trim() ? content.trim().split(/\s+/).length : 0}
              <span className="opacity-50"> WRD</span>
            </div>
            <div className="h-3 w-px" style={{ background: 'var(--b)' }} />
            <div className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--t-faint)' }}>
              {charCount}
              <span className="opacity-50"> CHR</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MEMORY ARCHIVE ── */}
      {recent.filter(e => e.date !== date).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, #00f5ff30, transparent)' }} />
            <span className="text-[9px] font-black tracking-[0.25em]"
              style={{ color: '#00f5ff', opacity: 0.5 }}>MEMORY_ARCHIVE</span>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(270deg, #00f5ff30, transparent)' }} />
          </div>

          <div className="space-y-1.5">
            {recent.filter(e => e.date !== date).slice(0, 5).map((e, i) => {
              const em = MOODS.find(m => m.value === e.mood);
              return (
                <button key={e.id} onClick={() => setDate(e.date)}
                  className="tap w-full rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01] relative overflow-hidden group"
                  style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                  {/* Hover neon edge */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: em?.color ?? '#00f5ff', boxShadow: `0 0 8px ${em?.color ?? '#00f5ff'}` }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold"
                        style={{ color: '#00f5ff', opacity: 0.5 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-mono font-semibold text-head">
                        {format(parseISO(e.date), 'EEE dd MMM').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {em && (
                        <span className="text-[9px] font-black tracking-widest"
                          style={{ color: em.color, opacity: 0.7 }}>{em.code}</span>
                      )}
                      {em && <span className="text-base">{em.emoji}</span>}
                    </div>
                  </div>
                  <p className="text-[11px] mt-1 line-clamp-1 font-mono pl-5"
                    style={{ color: 'var(--t-muted)', opacity: 0.7 }}>
                    {e.content}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
