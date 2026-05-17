import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  { value: 1, emoji: '😞', label: 'CRITICAL',  color: '#ff003c', code: 'ERR_FATAL'   },
  { value: 2, emoji: '😕', label: 'DEGRADED',  color: '#ff6600', code: 'PERF_LOW'    },
  { value: 3, emoji: '😐', label: 'NOMINAL',   color: '#ffe000', code: 'STANDBY'     },
  { value: 4, emoji: '🙂', label: 'OPTIMAL',   color: '#00ff9f', code: 'SYS_ONLINE'  },
  { value: 5, emoji: '😄', label: 'OVERCLOCK', color: '#00f5ff', code: 'MAX_OUTPUT'  },
];

// ── Cyber Rain Canvas ─────────────────────────────────────────────────────────
function CyberRain({ height = 120 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth || 600;
    canvas.width = W; canvas.height = height;
    const cols = Math.floor(W / 14);
    const drops = Array.from({ length: cols }, () => Math.random() * -height);
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ!#$%&*'.split('');
    let raf: number;
    function draw() {
      ctx!.fillStyle = 'rgba(0,0,0,0.18)';
      ctx!.fillRect(0, 0, W, height);
      drops.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const bright = y < 20;
        ctx!.fillStyle = bright ? '#ffffff' : (Math.random() > 0.5 ? '#00f5ff' : '#00ff9f');
        ctx!.font = bright ? 'bold 11px monospace' : '10px monospace';
        ctx!.globalAlpha = bright ? 0.9 : 0.35;
        ctx!.fillText(ch, i * 14, y);
        ctx!.globalAlpha = 1;
        drops[i] = y > height + Math.random() * 40 ? -12 : y + 13;
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [height]);
  return <canvas ref={canvasRef} style={{ width: '100%', height, display: 'block' }} />;
}

// ── HUD corner brackets ────────────────────────────────────────────────────────
function HUD({ color = '#00f5ff', size = 14, opacity = 0.6 }: { color?: string; size?: number; opacity?: number }) {
  const s = `${size}px`, b = `1.5px solid ${color}`;
  return (
    <>
      <div className="absolute top-0 left-0"    style={{ width: s, height: s, borderTop: b, borderLeft:  b, opacity, pointerEvents: 'none' }} />
      <div className="absolute top-0 right-0"   style={{ width: s, height: s, borderTop: b, borderRight: b, opacity, pointerEvents: 'none' }} />
      <div className="absolute bottom-0 left-0"  style={{ width: s, height: s, borderBottom: b, borderLeft:  b, opacity, pointerEvents: 'none' }} />
      <div className="absolute bottom-0 right-0" style={{ width: s, height: s, borderBottom: b, borderRight: b, opacity, pointerEvents: 'none' }} />
    </>
  );
}

// ── Neon divider ──────────────────────────────────────────────────────────────
function NeonDivider({ label, color = '#00f5ff' }: { label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${color}50, transparent)` }} />
      <span className="text-[9px] font-black tracking-[0.3em]"
        style={{ color, opacity: 0.6, textShadow: `0 0 8px ${color}` }}>{label}</span>
      <div className="h-px flex-1" style={{ background: `linear-gradient(270deg, ${color}50, transparent)` }} />
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
  const accent   = moodData?.color ?? '#00f5ff';

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page pb-10 px-1 sm:px-0"
      style={{ '--accent-rgb': '0 245 255' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(0,245,255,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ════════════════════════════════════ HERO HEADER */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ border: `1px solid ${accent}25`, background: 'var(--hero-bg)' }}>

        {/* Matrix rain */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.55 }}>
          <CyberRain height={130} />
        </div>

        {/* Dark vignette over rain */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.75) 100%)' }} />

        {/* Neon top edge */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 12px ${accent}` }} />

        <HUD color={accent} size={16} opacity={0.8} />

        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black tracking-[0.35em] cyber-flicker"
                  style={{ color: accent, textShadow: `0 0 10px ${accent}` }}>SYS://</span>
                <span className="text-[9px] font-mono text-white opacity-40 tracking-widest">NEURAL_LOG v2.7</span>
                <span className="cursor-blink font-mono" style={{ color: accent, fontSize: 12 }}>▌</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight leading-none"
                style={{ color: '#fff', textShadow: `0 0 30px ${accent}60, 0 2px 4px rgba(0,0,0,0.8)` }}>
                JOURNAL
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[11px]"
                  style={{ color: accent, textShadow: `0 0 8px ${accent}` }}>
                  [{isToday ? 'LIVE' : 'ARCHIVE'}]
                </span>
                <span className="font-mono text-[10px] text-white opacity-30">
                  {format(parseISO(date), 'yyyy-MM-dd')}
                </span>
              </div>
            </div>

            {/* Mood orb */}
            <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
              <div className="relative flex items-center justify-center w-14 h-14 rounded-full"
                style={{
                  background: moodData ? `${moodData.color}10` : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${moodData?.color ?? '#ffffff'}25`,
                  boxShadow: moodData ? `0 0 20px ${moodData.color}40, inset 0 0 20px ${moodData.color}10` : 'none',
                }}>
                <span className="text-2xl">{moodData?.emoji ?? '◌'}</span>
              </div>
              <span className="text-[8px] font-black tracking-widest"
                style={{ color: moodData?.color ?? '#ffffff', opacity: moodData ? 1 : 0.2,
                  textShadow: moodData ? `0 0 8px ${moodData.color}` : 'none' }}>
                {moodData?.code ?? 'NO_DATA'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom neon edge */}
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}50, transparent)` }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ════════════════════════════════════ DATE NAV */}
      <div className="relative rounded-2xl px-4 py-2.5 flex items-center gap-3"
        style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.06)' }}>
        <HUD color={accent} size={10} opacity={0.4} />

        <button onClick={() => goDay(-1)} className="tap p-2 rounded-lg"
          style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-mono font-bold tracking-wider text-white">
            {format(parseISO(date), 'EEE, dd MMM yyyy').toUpperCase()}
          </p>
          <p className="text-[9px] font-mono" style={{ color: accent, opacity: 0.5 }}>
            {isToday ? '>> CURRENT TIMESTAMP <<' : '// HISTORICAL_RECORD'}
          </p>
        </div>

        <button onClick={() => goDay(1)} disabled={isToday}
          className="tap p-2 rounded-lg disabled:opacity-20"
          style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="tap text-[10px] font-black tracking-widest px-3 py-1.5 rounded-lg"
            style={{ background: `${accent}10`, color: accent, border: `1px solid ${accent}30`,
              textShadow: `0 0 8px ${accent}`, boxShadow: `0 0 12px ${accent}20` }}>
            &gt;&gt; NOW
          </button>
        )}
      </div>

      {/* ════════════════════════════════════ EDITOR */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          background: '#080808',
          border: `1px solid ${focused ? accent + '40' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: focused ? `0 0 40px ${accent}12` : 'none',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
        <HUD color={accent} size={14} opacity={focused ? 0.8 : 0.35} />

        {/* CRT scanlines */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ zIndex: 0 }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${accent}03 3px, ${accent}03 4px)`,
          }} />
        </div>

        <div className="relative z-10 p-4 space-y-4">

          {/* ─ MOOD ─ */}
          <div>
            <NeonDivider label="STATUS_VECTOR" color={accent} />
            <div className="flex gap-2 flex-wrap mt-2.5">
              {MOODS.map(m => (
                <button key={m.value}
                  onClick={() => { setMood(mood === m.value ? null : m.value); setSaved(false); }}
                  className="tap flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl transition-all"
                  style={{
                    background: mood === m.value ? `${m.color}12` : '#0f0f0f',
                    border: `1px solid ${mood === m.value ? m.color + '60' : 'rgba(255,255,255,0.05)'}`,
                    boxShadow: mood === m.value ? `0 0 16px ${m.color}35, inset 0 0 12px ${m.color}08` : 'none',
                    transform: mood === m.value ? 'scale(1.08)' : undefined,
                  }}>
                  <span className="text-xl">{m.emoji}</span>
                  <span className="text-[8px] font-black tracking-widest"
                    style={{ color: mood === m.value ? m.color : 'rgba(255,255,255,0.25)',
                      textShadow: mood === m.value ? `0 0 8px ${m.color}` : 'none' }}>
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
              <span className="font-mono text-[9px] ml-3 shrink-0 tabular-nums"
                style={{ color: charCount > 0 ? accent : 'rgba(255,255,255,0.2)',
                  textShadow: charCount > 0 ? `0 0 6px ${accent}` : 'none' }}>
                {String(charCount).padStart(5, '0')}B
              </span>
            </div>
            <div className="relative">
              {focused && (
                <div className="absolute top-0 left-6 right-6 h-px pointer-events-none"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}80, transparent)`,
                    boxShadow: `0 0 8px ${accent}60` }} />
              )}
              <textarea
                value={content}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={e => { setContent(e.target.value); setCharCount(e.target.value.length); setSaved(false); setSaveErr(''); }}
                rows={10}
                placeholder="// begin neural transmission..."
                className="w-full rounded-xl px-3 py-3 text-sm resize-none leading-relaxed focus:outline-none font-mono transition-all"
                style={{
                  background: '#050505',
                  color: '#e2e8f0',
                  border: `1.5px solid ${listening ? '#ff009060' : focused ? accent + '45' : 'rgba(255,255,255,0.04)'}`,
                  paddingRight: supported ? '2.75rem' : '0.75rem',
                  caretColor: accent,
                  boxShadow: focused ? `inset 0 0 30px ${accent}06` : 'none',
                }}
              />
              {supported && (
                <button type="button" onClick={listening ? stop : start}
                  className="tap absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all"
                  style={listening
                    ? { background: '#ff009015', color: '#ff0090', border: '1px solid #ff009050',
                        boxShadow: '0 0 16px #ff009060', animation: 'neon-pulse 0.9s ease-in-out infinite' }
                    : { background: '#0f0f0f', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {listening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
            </div>
            {listening && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: '#ff0090', boxShadow: '0 0 8px #ff0090', animation: 'neon-pulse 0.7s ease-in-out infinite' }} />
                <span className="text-[10px] font-mono" style={{ color: '#ff0090', textShadow: '0 0 8px #ff0090' }}>
                  REC:ACTIVE — neural audio capture running
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
                placeholder="tag_one, tag_two, tag_three..."
                className="w-full rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none font-mono"
                style={{
                  background: '#050505',
                  color: '#e2e8f0',
                  border: '1.5px solid rgba(255,255,255,0.04)',
                  caretColor: accent,
                }}
              />
            </div>
          </div>

          {/* ─ ERROR ─ */}
          {saveErr && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: '#ff003c08', border: '1px solid #ff003c40' }}>
              <AlertCircle size={13} style={{ color: '#ff003c', flexShrink: 0 }} />
              <span className="text-[11px] font-mono" style={{ color: '#ff003c' }}>
                ERR // {saveErr}
              </span>
            </div>
          )}

          {/* ─ SAVE ─ */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={saving || !content.trim()}
              className="tap flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[11px] tracking-widest transition-all disabled:opacity-30"
              style={saved
                ? { background: '#00ff9f10', color: '#00ff9f', border: '1px solid #00ff9f40',
                    boxShadow: '0 0 20px #00ff9f30', textShadow: '0 0 8px #00ff9f' }
                : { background: `${accent}10`, color: accent, border: `1px solid ${accent}35`,
                    boxShadow: `0 0 16px ${accent}20`, textShadow: `0 0 8px ${accent}` }}>
              {saved
                ? <><CheckCircle2 size={14} /> UPLOADED</>
                : saving
                  ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> TRANSMITTING…</>
                  : <><Save size={14} /> UPLOAD</>}
            </button>
            <div className="ml-auto flex items-center gap-3 font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <span>{content.trim() ? content.trim().split(/\s+/).length : 0}<span className="opacity-50"> WRD</span></span>
              <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
              <span>{charCount}<span className="opacity-50"> CHR</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════ MEMORY ARCHIVE */}
      {recent.filter(e => e.date !== date).length > 0 && (
        <div>
          <NeonDivider label="// MEMORY_ARCHIVE" color="#00f5ff" />
          <div className="space-y-1.5 mt-2">
            {recent.filter(e => e.date !== date).slice(0, 5).map((e, i) => {
              const em = MOODS.find(m => m.value === e.mood);
              return (
                <button key={e.id} onClick={() => setDate(e.date)}
                  className="tap w-full rounded-xl px-3 py-2.5 text-left transition-all group relative overflow-hidden"
                  style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* Left neon stripe on hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: em?.color ?? '#00f5ff', boxShadow: `0 0 10px ${em?.color ?? '#00f5ff'}` }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px]" style={{ color: '#00f5ff', opacity: 0.4 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">
                        {format(parseISO(e.date), 'EEE dd MMM').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {em && <span className="text-[8px] font-black tracking-widest"
                        style={{ color: em.color, textShadow: `0 0 6px ${em.color}` }}>{em.code}</span>}
                      {em && <span className="text-base">{em.emoji}</span>}
                    </div>
                  </div>
                  <p className="text-[11px] mt-0.5 line-clamp-1 font-mono pl-6"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>{e.content}</p>
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
