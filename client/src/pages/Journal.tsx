import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff, Tag, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
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

// ── Moods — plain words, ember scale ─────────────────────────────────────────
const MOODS = [
  { value: 1, label: 'Rough', color: '#b3372e' },
  { value: 2, label: 'Low',   color: '#c2553d' },
  { value: 3, label: 'Okay',  color: '#d4a27f' },
  { value: 4, label: 'Good',  color: '#d9a066' },
  { value: 5, label: 'Great', color: '#e08b4e' },
];

// ── Quiet section label ───────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10.5px] font-black tracking-[0.20em] uppercase shrink-0"
        style={{ color: 'var(--t-muted)' }}>{text}</span>
      <div className="section-rule flex-1" />
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

  const appendTranscript = useCallback((text: string) => {
    setContent(prev => (prev ? prev + ' ' + text : text));
    setSaved(false);
  }, []);
  const { listening, supported, start, stop } = useSpeech(appendTranscript);

  const loadEntry = useCallback(async (d: string) => {
    setSaved(false); setSaveErr('');
    try {
      const res = await api.get<JournalEntry>(`/journal/${d}`);
      setContent(res.data.content ?? '');
      setMood(res.data.mood ?? null);
      setTags((JSON.parse(res.data.tags || '[]') as string[]).join(', '));
    } catch { setContent(''); setMood(null); setTags(''); }
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
      setSaveErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not save — try again.');
    } finally { setSaving(false); }
  }

  const goDay = (d: number) => {
    const base = new Date(date + 'T00:00:00');
    setDate((d > 0 ? addDays : subDays)(base, Math.abs(d)).toISOString().slice(0, 10));
  };
  const isToday   = date === new Date().toISOString().slice(0, 10);
  const moodData  = MOODS.find(m => m.value === mood);
  const accent    = moodData?.color ?? '#d4a27f';
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-7 anim-page pb-10 px-1 sm:px-0"
      style={{ '--accent-rgb': '212 162 127' } as React.CSSProperties}>

      <PaperBanner
        title="Journal"
        label="Daily Pages"
        accent="#d4a27f"
        subtitle={`${format(parseISO(date), 'EEEE, d MMMM yyyy')}${isToday ? ' · today' : ''}`}
        icon={BookOpen}
        right={
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center w-11 h-11 rounded-full"
              style={{
                background: moodData ? `${moodData.color}18` : 'transparent',
                border: `1.5px ${moodData ? 'solid' : 'dashed'} ${moodData ? moodData.color + '55' : 'var(--bh)'}`,
              }}>
              <span className="w-3.5 h-3.5 rounded-full block"
                style={{ background: moodData ? moodData.color : 'var(--s3)' }} />
            </div>
            <span className="text-[9px] font-semibold"
              style={{ color: moodData?.color ?? 'var(--t-faint)' }}>
              {moodData?.label ?? 'No mood'}
            </span>
          </div>
        }
      />

      {/* ── Date nav ── */}
      <div className="card px-4 py-2.5 flex items-center gap-3">
        <button onClick={() => goDay(-1)} className="tap p-2 rounded-lg"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--t-head)' }}>
            {format(parseISO(date), 'EEE, d MMM yyyy')}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
            {isToday ? "Today's page" : 'An earlier page'}
          </p>
        </div>

        <button onClick={() => goDay(1)} disabled={isToday}
          className="tap p-2 rounded-lg disabled:opacity-20"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="tap text-[11px] font-bold px-3 py-1.5 rounded-lg"
            style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}>
            Today
          </button>
        )}
      </div>

      {/* ── The page itself ── */}
      <div className="card-raised overflow-hidden paper-ruled fold-corner"
        style={{ borderColor: focused ? `${accent}45` : undefined, transition: 'border-color 0.3s', border: '1.5px solid var(--gl-border-h)' }}>
        <div className="p-4 space-y-4">

          {/* Mood */}
          <div>
            <SectionLabel text="How was today" />
            <div className="flex gap-2 flex-wrap mt-2.5">
              {MOODS.map(m => (
                <button key={m.value}
                  onClick={() => { setMood(mood === m.value ? null : m.value); setSaved(false); }}
                  className="tap flex items-center gap-1.5 px-3 py-2 rounded-xl"
                  style={{
                    background: mood === m.value ? `${m.color}16` : 'var(--s3)',
                    border: `1px solid ${mood === m.value ? m.color + '55' : 'transparent'}`,
                  }}>
                  <span className="w-2.5 h-2.5 rounded-full block" style={{ background: m.color }} />
                  <span className="text-xs font-semibold"
                    style={{ color: mood === m.value ? m.color : 'var(--t-dim)' }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Entry */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel text="The entry" />
              <span className="text-[10px] ml-3 shrink-0 tabular-nums" style={{ color: 'var(--t-faint)' }}>
                {wordCount ? `${wordCount} word${wordCount === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            <div className="relative paper-ruled rounded-xl"
              style={{ background: 'var(--s1)', border: `1.5px solid ${listening ? '#c2553d55' : focused ? accent + '50' : 'var(--b)'}`, transition: 'border-color 0.25s' }}>
              <textarea
                value={content}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={e => { setContent(e.target.value); setSaved(false); setSaveErr(''); }}
                rows={10}
                placeholder="What happened today? Put it on the page — plain and honest…"
                className="w-full rounded-xl px-4 py-3 text-[15px] resize-none focus:outline-none"
                style={{
                  background: 'transparent',
                  color: 'var(--t-body)',
                  border: 'none',
                  boxShadow: 'none',
                  paddingRight: supported ? '2.75rem' : '1rem',
                  caretColor: accent,
                  fontFamily: "'Lora', Georgia, serif",
                  lineHeight: '28px',
                  transition: 'border-color 0.25s',
                }}
              />
              {supported && (
                <button type="button" onClick={listening ? stop : start}
                  className="tap absolute top-2.5 right-2.5 p-1.5 rounded-lg"
                  style={listening
                    ? { background: '#c2553d18', color: '#c2553d', border: '1px solid #c2553d50' }
                    : { background: 'var(--s3)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                  {listening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
            </div>
            {listening && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 glow-pulse" style={{ background: '#c2553d' }} />
                <span className="text-[11px]" style={{ color: '#c2553d' }}>
                  Listening — speak your entry
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <SectionLabel text="Tags" />
            <div className="relative mt-2">
              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--t-faint)' }} />
              <input
                value={tags}
                onChange={e => { setTags(e.target.value); setSaved(false); }}
                placeholder="work, family, training…"
                className="w-full rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none"
                style={{
                  background: 'var(--s1)',
                  color: 'var(--t-body)',
                  border: '1px solid var(--b)',
                  caretColor: accent,
                }}
              />
            </div>
          </div>

          {/* Error */}
          {saveErr && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(179,55,46,0.08)', border: '1px solid rgba(179,55,46,0.3)' }}>
              <AlertCircle size={13} style={{ color: '#cd5a4f', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: '#cd5a4f' }}>{saveErr}</span>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={saving || !content.trim()}
              className="tap flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs disabled:opacity-30"
              style={saved
                ? { background: '#cf8a3e18', color: '#cf8a3e', border: '1px solid #cf8a3e40' }
                : { background: accent, color: '#fff', border: `1px solid ${accent}` }}>
              {saved
                ? <><CheckCircle2 size={14} /> Saved</>
                : saving
                  ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Saving…</>
                  : <><Save size={14} /> Save entry</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Earlier pages ── */}
      {recent.filter(e => e.date !== date).length > 0 && (
        <div>
          <SectionLabel text="Earlier pages" />
          <div className="space-y-1.5 mt-2.5">
            {recent.filter(e => e.date !== date).slice(0, 5).map(e => {
              const em = MOODS.find(m => m.value === e.mood);
              return (
                <button key={e.id} onClick={() => setDate(e.date)}
                  className="tap card w-full px-4 py-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: 'var(--t-head)' }}>
                      {format(parseISO(e.date), 'EEEE, d MMM')}
                    </span>
                    {em && (
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: em.color }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: em.color }} />
                        {em.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 line-clamp-1"
                    style={{ color: 'var(--t-dim)', fontFamily: "'Lora', Georgia, serif" }}>
                    {e.content}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty hint when no past entries */}
      {recent.length === 0 && !content && (
        <div className="card py-10 text-center">
          <BookOpen size={26} style={{ color: 'var(--t-faint)', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>The book is empty</p>
          <p className="text-xs mt-1" style={{ color: 'var(--t-faint)' }}>Write today's first page above</p>
        </div>
      )}
    </div>
  );
}
