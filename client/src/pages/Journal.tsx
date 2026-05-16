import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff, BookOpen, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import api from '../lib/api';
import type { JournalEntry } from '../types';

// ── Web Speech API types ───────────────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
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
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .slice(e.results.length - 1)
        .map(r => r[0].transcript)
        .join('');
      onTranscript(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

// ── Mood config ────────────────────────────────────────────────────────────────
const MOODS = [
  { value: 1, emoji: '😞', label: 'Terrible', color: '#ef4444' },
  { value: 2, emoji: '😕', label: 'Bad',      color: '#f97316' },
  { value: 3, emoji: '😐', label: 'Okay',     color: '#f59e0b' },
  { value: 4, emoji: '🙂', label: 'Good',     color: '#22c55e' },
  { value: 5, emoji: '😄', label: 'Great',    color: '#6366f1' },
];

// ── Main component ─────────────────────────────────────────────────────────────
export default function Journal() {
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState('');
  const [mood, setMood]       = useState<number | null>(null);
  const [tags, setTags]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [recent, setRecent]   = useState<JournalEntry[]>([]);

  const appendTranscript = useCallback((text: string) => {
    setContent(prev => prev ? prev + ' ' + text : text);
    setSaved(false);
  }, []);
  const { listening, supported, start, stop } = useSpeech(appendTranscript);

  // ── Load entry for a given date ──────────────────────────────────────────────
  const loadEntry = useCallback(async (d: string) => {
    setSaved(false);
    setSaveErr('');
    try {
      const res = await api.get<JournalEntry>(`/journal/${d}`);
      setContent(res.data.content ?? '');
      setMood(res.data.mood ?? null);
      const parsedTags: string[] = JSON.parse(res.data.tags || '[]');
      setTags(parsedTags.join(', '));
    } catch {
      setContent('');
      setMood(null);
      setTags('');
    }
  }, []);

  useEffect(() => { loadEntry(date); }, [date, loadEntry]);

  useEffect(() => {
    api.get<JournalEntry[]>('/journal?limit=10').then(r => setRecent(r.data)).catch(() => {});
  }, [saved]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    setSaveErr('');
    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.put(`/journal/${date}`, { content, mood, tags: parsedTags });
      setSaved(true);
      loadEntry(date);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to save — please try again';
      setSaveErr(msg);
    } finally {
      setSaving(false);
    }
  }

  const goDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    setDate((delta > 0 ? addDays : subDays)(d, Math.abs(delta)).toISOString().slice(0, 10));
  };

  const isToday  = date === new Date().toISOString().slice(0, 10);
  const moodData = MOODS.find(m => m.value === mood);

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-page pb-10 px-1 sm:px-0">

      {/* ── Page header ── */}
      <div className="flex items-center gap-2">
        <BookOpen size={20} style={{ color: 'rgb(var(--accent-rgb))' }} />
        <h1 className="text-2xl font-bold text-head">Journal</h1>
        {moodData && (
          <span className="ml-auto text-2xl" title={moodData.label}>{moodData.emoji}</span>
        )}
      </div>

      {/* ── Date navigation ── */}
      <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
        <button onClick={() => goDay(-1)} className="tap p-2 rounded-xl transition-colors"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
          <ChevronLeft size={18} />
        </button>

        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-head">{format(parseISO(date), 'EEEE, d MMMM yyyy')}</p>
          {isToday && (
            <span className="text-[11px] font-bold" style={{ color: 'rgb(var(--accent-rgb))' }}>Today</span>
          )}
        </div>

        <button onClick={() => goDay(1)} disabled={isToday}
          className="tap p-2 rounded-xl transition-colors disabled:opacity-30"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
          <ChevronRight size={18} />
        </button>

        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="tap text-[11px] font-bold px-3 py-1.5 rounded-xl"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            Today
          </button>
        )}
      </div>

      {/* ── Editor card ── */}
      <div className="glass rounded-2xl p-4 space-y-4" style={{ border: '1px solid var(--b)' }}>

        {/* Mood selector */}
        <div>
          <p className="text-[11px] font-bold tracking-wider uppercase mb-2" style={{ color: 'var(--t-muted)' }}>
            HOW ARE YOU FEELING?
          </p>
          <div className="flex gap-2 flex-wrap">
            {MOODS.map(m => (
              <button key={m.value}
                onClick={() => setMood(mood === m.value ? null : m.value)}
                title={m.label}
                className="tap text-2xl p-1.5 rounded-xl transition-all"
                style={{
                  background: mood === m.value ? `${m.color}20` : 'var(--s3)',
                  border: mood === m.value ? `2px solid ${m.color}60` : '2px solid transparent',
                  transform: mood === m.value ? 'scale(1.15)' : undefined,
                  boxShadow: mood === m.value ? `0 0 12px ${m.color}50` : undefined,
                }}>
                {m.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea + mic button */}
        <div className="relative">
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setSaved(false); setSaveErr(''); }}
            rows={10}
            placeholder="Write about your day… or tap the mic to speak."
            className="w-full rounded-xl px-3 py-3 text-sm resize-none leading-relaxed focus:outline-none transition-all"
            style={{
              background: 'var(--s2)',
              color: 'var(--t-body)',
              border: listening
                ? '2px solid #ef444460'
                : '2px solid var(--b)',
              paddingRight: supported ? '2.5rem' : '0.75rem',
            }}
          />
          {supported && (
            <button
              type="button"
              onClick={listening ? stop : start}
              title={listening ? 'Stop recording' : 'Speak your entry'}
              className="tap absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all"
              style={listening
                ? { background: '#ef4444', color: '#fff', animation: 'pulse 1.5s ease-in-out infinite' }
                : { background: 'var(--s3)', color: 'var(--t-muted)' }}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}
        </div>

        {listening && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: '#ef4444' }}>
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
            Listening — speak clearly, tap mic to stop
          </p>
        )}

        {/* Tags */}
        <div className="relative">
          <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t-faint)' }} />
          <input
            value={tags}
            onChange={e => { setTags(e.target.value); setSaved(false); }}
            placeholder="Tags (comma-separated): work, health, goals…"
            className="w-full rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--s2)',
              color: 'var(--t-body)',
              border: '2px solid var(--b)',
            }}
          />
        </div>

        {/* Error banner */}
        {saveErr && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ background: '#ef444415', border: '1px solid #ef444440', color: '#ef4444' }}>
            <AlertCircle size={14} />
            {saveErr}
          </div>
        )}

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold tap transition-all disabled:opacity-40"
            style={{
              background: saved
                ? '#22c55e'
                : 'rgb(var(--accent-rgb))',
              color: '#fff',
              boxShadow: saved
                ? '0 0 16px #22c55e60'
                : '0 0 16px rgb(var(--accent-rgb)/0.4)',
            }}>
            {saved
              ? <><CheckCircle2 size={15} /> Saved</>
              : saving
                ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving…</>
                : <><Save size={15} /> Save entry</>}
          </button>
          {!content.trim() && (
            <span className="text-xs" style={{ color: 'var(--t-faint)' }}>Write something to save</span>
          )}
        </div>
      </div>

      {/* ── Recent entries ── */}
      {recent.filter(e => e.date !== date).length > 0 && (
        <div>
          <p className="text-[11px] font-black tracking-[0.14em] uppercase mb-2"
            style={{ color: 'var(--cyan)' }}>RECENT ENTRIES</p>
          <div className="space-y-2">
            {recent.filter(e => e.date !== date).slice(0, 5).map(e => {
              const em = MOODS.find(m => m.value === e.mood);
              return (
                <button key={e.id} onClick={() => setDate(e.date)}
                  className="glass w-full rounded-2xl px-4 py-3 text-left tap transition-all hover:scale-[1.01]"
                  style={{ border: '1px solid var(--b)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-head">
                      {format(parseISO(e.date), 'EEE, d MMM')}
                    </span>
                    {em && (
                      <span className="text-lg" title={em.label}>{em.emoji}</span>
                    )}
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--t-muted)' }}>{e.content}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
