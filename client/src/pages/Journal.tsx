import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Mic, MicOff } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import api from '../lib/api';
import type { JournalEntry } from '../types';

// Web Speech API types
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
  const [supported] = useState(() => typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined');

  const start = useCallback(() => {
    const Rec = (typeof SpeechRecognition !== 'undefined' ? SpeechRecognition : webkitSpeechRecognition);
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
    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); };
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

const MOODS = [
  { value: 1, emoji: '😞', label: 'Terrible' },
  { value: 2, emoji: '😕', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

export default function Journal() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<JournalEntry[]>([]);

  const appendTranscript = useCallback((text: string) => {
    setContent(prev => prev ? prev + ' ' + text : text);
    setSaved(false);
  }, []);
  const { listening, supported, start, stop } = useSpeech(appendTranscript);

  const loadEntry = useCallback(async (d: string) => {
    setSaved(false);
    try {
      const res = await api.get<JournalEntry>(`/journal/${d}`);
      setContent(res.data.content);
      setMood(res.data.mood);
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
    api.get<JournalEntry[]>('/journal?limit=10').then(r => setRecent(r.data));
  }, [saved]);

  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.put(`/journal/${date}`, { content, mood, tags: parsedTags });
      setSaved(true);
      loadEntry(date);
    } finally {
      setSaving(false);
    }
  }

  const goDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    setDate((delta > 0 ? addDays : subDays)(d, Math.abs(delta)).toISOString().slice(0, 10));
  };

  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Journal</h1>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button onClick={() => goDay(-1)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-medium">{format(parseISO(date), 'EEEE, d MMMM yyyy')}</p>
          {isToday && <span className="text-xs text-brand-400">Today</span>}
        </div>
        <button onClick={() => goDay(1)} disabled={isToday}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 transition-colors">
          <ChevronRight size={18} />
        </button>
        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-xs text-brand-400 hover:text-brand-300 px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">
            Today
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        {/* Mood */}
        <div>
          <p className="text-xs text-gray-400 mb-2">How are you feeling?</p>
          <div className="flex gap-3">
            {MOODS.map(m => (
              <button key={m.value} onClick={() => setMood(mood === m.value ? null : m.value)}
                title={m.label}
                className={`text-2xl p-1 rounded-lg transition-all ${mood === m.value ? 'bg-gray-700 scale-110 ring-2 ring-brand-500' : 'hover:bg-gray-800 opacity-60 hover:opacity-100'}`}>
                {m.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Content + voice */}
        <div className="relative">
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setSaved(false); }}
            rows={10}
            placeholder="Write about your day... or tap the mic to speak."
            className={`w-full bg-gray-800 border rounded-lg px-3 py-3 pr-12 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none leading-relaxed transition-colors ${listening ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-700'}`}
          />
          {supported && (
            <button
              type="button"
              onClick={listening ? stop : start}
              title={listening ? 'Stop recording' : 'Speak your entry (English)'}
              className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all ${listening ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
        {listening && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening in English — speak clearly, tap the mic to stop
          </p>
        )}

        {/* Tags */}
        <input
          value={tags}
          onChange={e => { setTags(e.target.value); setSaved(false); }}
          placeholder="Tags (comma-separated): work, health, goals..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        <button onClick={save} disabled={saving || !content.trim()}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Save size={15} />
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save entry'}
        </button>
      </div>

      {/* Recent entries */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Recent entries</h2>
          <div className="space-y-2">
            {recent.filter(e => e.date !== date).slice(0, 5).map(e => (
              <button key={e.id} onClick={() => setDate(e.date)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-left hover:bg-gray-800 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-200">
                    {format(parseISO(e.date), 'EEE, d MMM')}
                  </span>
                  {e.mood && <span className="text-lg">{MOODS.find(m => m.value === e.mood)?.emoji}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{e.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
