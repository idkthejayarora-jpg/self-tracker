import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Send, BookOpen, Moon, Salad, Dumbbell, Target,
  CheckSquare, Activity, Wallet, ShieldOff, Video, Bell, Check, Plus, RotateCcw, AudioLines,
} from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
import api from '../lib/api';
import { useVoiceInput } from '../hooks/useVoiceInput';
import AxisOrb, { type OrbState } from '../components/AxisOrb';

const JAY = '#e59a7f';

interface Msg { role: 'you' | 'sys'; text: string }

// The extraction sheet, rebuilt server-side from everything said so far —
// loosely typed on the client; we only render what's present.
interface Sheet {
  journal?: { mood?: number; text?: string; tags?: string[] };
  sleep?: { duration_minutes?: number; quality?: number };
  meals?: { name: string; meal_type?: string; calories?: number }[];
  workout?: { name?: string; exercises?: { name: string }[]; cardio_minutes?: number };
  habits_done?: string[];
  tasks_done?: string[];
  tasks_add?: { title: string }[];
  body?: { weight_kg?: number; body_fat_pct?: number };
  finance?: { type: string; amount: number }[];
  detox?: { app: string; status: string }[];
  content_ideas?: { title: string }[];
  reminders?: { title: string }[];
}

const MOODS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_COLORS = ['', '#b3372e', '#b5764f', '#d4a27f', '#cf8a3e', '#e08b4e'];

function NoteRow({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string; value: string; color?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-xl paper-in paper-spine"
      style={{ background: 'var(--s2)', border: '1.5px solid var(--b)' }}>
      <Icon size={13} style={{ color: color || JAY, marginTop: 2, flexShrink: 0 }} />
      <div className="min-w-0">
        <p className="text-[9px] font-black tracking-[0.14em] uppercase" style={{ color: 'var(--t-muted)' }}>{label}</p>
        <p className="text-[12px] leading-snug font-medium" style={{ color: 'var(--t-body)' }}>{value}</p>
      </div>
    </div>
  );
}

export default function Jay() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sheet, setSheet] = useState<Sheet>({});
  const [extracting, setExtracting] = useState(false);
  const [filled, setFilled] = useState<string[] | null>(null);
  const [input, setInput] = useState('');
  const [name, setName] = useState<string | null>(null);

  const textRef = useRef('');          // everything said this session, joined
  const committedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── add one spoken/typed update → re-extract from the full session text ─────
  const addUpdate = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t || committedRef.current) return;
    setInput('');
    setMsgs(m => [...m, { role: 'you', text: t }]);
    textRef.current = textRef.current ? `${textRef.current}. ${t}` : t;
    setExtracting(true);
    try {
      const r = await api.post('/jay/extract', { text: textRef.current });
      const { sheet: s, caught } = r.data as { sheet: Sheet; caught: string[] };
      setSheet(s || {});
      setMsgs(m => [...m, {
        role: 'sys',
        text: caught?.length
          ? `Got it — ${caught.join(' · ')}.`
          : "Didn't catch a field there. Try naming the food, the workout, the hours, or what you spent.",
      }]);
    } catch {
      setMsgs(m => [...m, { role: 'sys', text: 'That one slipped — say it again?' }]);
    } finally {
      setExtracting(false);
    }
  }, []);

  const voice = useVoiceInput({ onFinal: (text) => { void addUpdate(text); }, silenceMs: 2000 });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // ── commit the gathered sheet into every sector ─────────────────────────────
  const save = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    voiceRef.current.stop();
    try {
      const r = await api.post('/jay/commit', { sheet });
      setFilled(r.data.filled || []);
    } catch {
      committedRef.current = false;
      setMsgs(m => [...m, { role: 'sys', text: "Saving didn't go through — hit save again." }]);
    }
  }, [sheet]);

  const reset = useCallback(() => {
    voiceRef.current.stop();
    committedRef.current = false;
    textRef.current = '';
    setMsgs([]); setSheet({}); setFilled(null); setInput('');
  }, []);

  useEffect(() => {
    void api.get('/jay/state').then(r => setName(r.data?.name || null)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, extracting, filled]);

  const orbState: OrbState =
    voice.listening ? 'listening' : extracting ? 'thinking' : 'idle';

  const statusLine =
    filled ? 'Filed. See you tomorrow.'
    : voice.listening ? 'Listening — just talk'
    : extracting ? 'Sorting it…'
    : 'Tap the orb and tell me about your day';

  const sheetHasAnything = Object.values(sheet).some(v =>
    Array.isArray(v) ? v.length : v && Object.keys(v).length);

  function toggleMic() {
    if (filled) return;
    if (voice.listening) { voice.stop(); return; }
    voice.start();
  }

  return (
    <div className="space-y-4 paper-in">
      <PaperBanner
        title="Daily Log"
        label="Speak it, I'll file it"
        accent="#d97757"
        subtitle="voice your day — Jay listens and logs"
        icon={AudioLines}
      />

      <div className="grid md:grid-cols-3 gap-4 items-start">
        {/* ── Voice box ── */}
        <div className="md:col-span-2 card-raised rounded-2xl overflow-hidden paper-spine paper-wrap"
          style={{ background: 'var(--s1)', border: '1.5px solid var(--gl-border-h)' }}>

          {/* Orb + status */}
          <div className="flex flex-col items-center pt-6 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
            <AxisOrb state={orbState} color={JAY} size={132} onTap={toggleMic} />
            <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--t-faint)' }}>{statusLine}</p>
          </div>

          {/* Transcript */}
          <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '44vh', minHeight: 180 }}>
            {/* Intro */}
            <div className="flex justify-start paper-in">
              <div className="max-w-[88%] px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                style={{
                  background: 'var(--s2)', border: '1px solid var(--b)',
                  borderRadius: '4px 16px 16px 14px', color: 'var(--t-body)', fontFamily: "'Lora', serif",
                }}>
                {`Tell me about your day${name ? `, ${name}` : ''} — what you ate, training, sleep, weight, money, screen time, anything. Say it all in one go or add as you remember, then save.`}
              </div>
            </div>

            {msgs.map((m, i) => (
              <div key={i} className={`flex paper-in ${m.role === 'you' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                  style={m.role === 'sys' ? {
                    background: 'var(--s2)', border: '1px solid var(--b)',
                    borderRadius: '4px 16px 16px 14px', color: 'var(--t-body)', fontFamily: "'Lora', serif",
                  } : {
                    background: 'rgb(var(--accent-rgb) / 0.10)', border: '1px solid rgb(var(--accent-rgb) / 0.22)',
                    borderRadius: '16px 4px 14px 16px', color: 'var(--t-body)',
                  }}>
                  {m.text}
                </div>
              </div>
            ))}

            {voice.listening && voice.interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3.5 py-2.5 text-[13.5px] italic rounded-2xl"
                  style={{ border: '1px dashed rgb(var(--accent-rgb) / 0.4)', color: 'var(--t-faint)' }}>
                  {voice.interim}…
                </div>
              </div>
            )}
            {extracting && (
              <div className="flex items-center gap-1.5 px-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: JAY, animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row — type it when you can't speak */}
          <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--b)', background: 'var(--s2)' }}>
            {voice.supported && (
              <button onClick={toggleMic} disabled={!!filled}
                title={voice.listening ? 'Stop listening' : 'Talk'}
                className="tap shrink-0 w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40"
                style={{
                  background: voice.listening ? JAY : 'var(--s1)',
                  border: `1px solid ${voice.listening ? JAY : 'var(--b)'}`,
                  color: voice.listening ? '#fff' : JAY,
                }}>
                <Mic size={16} />
              </button>
            )}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addUpdate(input); } }}
              placeholder={filled ? 'Saved' : 'Or type your update…'}
              disabled={extracting || !!filled}
              className="flex-1 rounded-xl px-3.5 py-2.5 text-[13px] disabled:opacity-50"
              style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)', outline: 'none' }}
            />
            <button onClick={() => void addUpdate(input)}
              disabled={!input.trim() || extracting || !!filled}
              className="tap shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              <Send size={15} />
            </button>
          </div>
        </div>

        {/* ── What it caught ── */}
        <div className="card rounded-2xl p-4 space-y-2 fold-corner"
          style={{ background: 'var(--s1)', border: '1.5px solid var(--gl-border-h)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--t-muted)' }}>
              Going into your tracker
            </p>
            {sheet.journal?.mood ? (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: `${MOOD_COLORS[sheet.journal.mood]}18`,
                  color: MOOD_COLORS[sheet.journal.mood],
                  border: `1px solid ${MOOD_COLORS[sheet.journal.mood]}35`,
                }}>
                {MOODS[sheet.journal.mood]}
              </span>
            ) : null}
          </div>

          {!sheetHasAnything && !filled && (
            <p className="text-[12px] leading-relaxed py-3" style={{ color: 'var(--t-faint)', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
              As you talk, each thing lands in its sector here — sleep, food, training, the lot. Check it, then save.
            </p>
          )}

          {sheet.sleep?.duration_minutes ? (
            <NoteRow icon={Moon} label="Sleep" color="#d4a27f"
              value={`${Math.round(sheet.sleep.duration_minutes / 60 * 10) / 10} hours${sheet.sleep.quality ? ` · quality ${sheet.sleep.quality}/5` : ''}`} />
          ) : null}

          {sheet.meals?.length ? (
            <NoteRow icon={Salad} label={`Food · ${sheet.meals.reduce((s, m) => s + (m.calories || 0), 0)} cal`} color="#b5764f"
              value={sheet.meals.map(m => m.name).join(', ')} />
          ) : null}

          {sheet.workout?.name ? (
            <NoteRow icon={Dumbbell} label="Training" color="#b3372e"
              value={`${sheet.workout.name}${sheet.workout.exercises?.length ? ` — ${sheet.workout.exercises.length} exercises` : ''}${sheet.workout.cardio_minutes ? ` · ${sheet.workout.cardio_minutes}min cardio` : ''}`} />
          ) : null}

          {sheet.habits_done?.length ? (
            <NoteRow icon={Target} label="Habits done" color="#d97757" value={sheet.habits_done.join(', ')} />
          ) : null}

          {sheet.tasks_done?.length ? (
            <NoteRow icon={CheckSquare} label="Finished" color="#cf8a3e" value={sheet.tasks_done.join(', ')} />
          ) : null}

          {sheet.tasks_add?.length ? (
            <NoteRow icon={Plus} label="New tasks" color="#c2553d" value={sheet.tasks_add.map(t => t.title).join(', ')} />
          ) : null}

          {sheet.body?.weight_kg ? (
            <NoteRow icon={Activity} label="Body" color="#d9a066" value={`${sheet.body.weight_kg} kg`} />
          ) : null}

          {sheet.finance?.length ? (
            <NoteRow icon={Wallet} label="Money" color="#d9a066"
              value={sheet.finance.map(f => `${f.type === 'income' ? '+' : '−'}${f.amount}`).join(', ')} />
          ) : null}

          {sheet.detox?.length ? (
            <NoteRow icon={ShieldOff} label="Screen time" color="#b5764f"
              value={sheet.detox.map(d => `${d.app}: ${d.status}`).join(', ')} />
          ) : null}

          {sheet.content_ideas?.length ? (
            <NoteRow icon={Video} label="Content ideas" color="#d4a27f"
              value={sheet.content_ideas.map(c => c.title).join(', ')} />
          ) : null}

          {sheet.reminders?.length ? (
            <NoteRow icon={Bell} label="Reminders" color="#d97757"
              value={sheet.reminders.map(r => r.title).join(', ')} />
          ) : null}

          {sheet.journal?.text ? (
            <div className="px-3 py-2.5 rounded-xl paper-in"
              style={{ background: 'var(--s2)', border: '1px dashed var(--bh)' }}>
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase mb-1 flex items-center gap-1.5" style={{ color: 'var(--t-faint)' }}>
                <BookOpen size={10} /> Journal entry
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--t-body)', fontFamily: "'Lora', serif" }}>
                {sheet.journal.text}
              </p>
            </div>
          ) : null}

          {/* Save */}
          {sheetHasAnything && !filled && (
            <button onClick={() => void save()}
              className="tap w-full py-2.5 rounded-xl text-[13px] font-bold text-white mt-1"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              Save it all to my tracker
            </button>
          )}

          {/* Filed confirmation */}
          {filled && (
            <div className="paper-in pt-1 space-y-1.5">
              <p className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--t-faint)' }}>
                Filed in for you
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(filled.length ? filled : ['Nothing new to file']).map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
                    style={{ background: '#cf8a3e14', border: '1px solid #cf8a3e30', color: '#cf8a3e' }}>
                    <Check size={11} /> {f}
                  </span>
                ))}
              </div>
              <button onClick={reset}
                className="tap inline-flex items-center gap-1.5 mt-1 text-[11px] px-3 py-1.5 rounded-xl"
                style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-faint)' }}>
                <RotateCcw size={11} /> New log
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
