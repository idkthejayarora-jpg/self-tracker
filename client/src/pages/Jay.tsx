import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Send, Volume2, VolumeX, BookOpen, Moon, Salad, Dumbbell, Target,
  CheckSquare, Activity, Wallet, ShieldOff, Video, Bell, Check, Plus, RotateCcw,
} from 'lucide-react';
import api from '../lib/api';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { speak, stopSpeaking, useSpeechVoices, pickJayVoice } from '../lib/voice';
import AxisOrb, { type OrbState } from '../components/AxisOrb';

const JAY = '#e59a7f';

interface Msg { role: 'jay' | 'user'; text: string }

// The extraction sheet Jay maintains server-side — loosely typed on the client,
// we only render what's present.
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
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-xl paper-in"
      style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
      <Icon size={13} style={{ color: color || JAY, marginTop: 2, flexShrink: 0 }} />
      <div className="min-w-0">
        <p className="text-[9px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--t-faint)' }}>{label}</p>
        <p className="text-[12px] leading-snug" style={{ color: 'var(--t-body)' }}>{value}</p>
      </div>
    </div>
  );
}

export default function Jay() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sheet, setSheet] = useState<Sheet>({});
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState(false);
  const [filled, setFilled] = useState<string[] | null>(null);
  const [aiLive, setAiLive] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('jay_voice_on') !== '0');
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem('jay_voice_uri') || '');

  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const committedRef = useRef(false);
  const voiceModeRef = useRef(false); // user's last input was spoken → keep the loop going
  const interactedRef = useRef(false); // browsers block TTS before first gesture
  const bottomRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  const voices = useSpeechVoices();
  const jayVoice = voiceURI
    ? (voices.find(v => v.voiceURI === voiceURI) ?? pickJayVoice(voices))
    : pickJayVoice(voices);
  const jayVoiceRef = useRef(jayVoice);
  jayVoiceRef.current = jayVoice;

  // ── speak a Jay line, then (in voice mode) hand the mic back ────────────────
  const sayRef = useRef<(text: string, after?: () => void) => void>(() => {});
  const voice = useVoiceInput({
    onFinal: (text) => { voiceModeRef.current = true; void sendUser(text); },
    silenceMs: 2000,
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const say = useCallback((text: string, after?: () => void) => {
    if (!voiceOnRef.current || !interactedRef.current) { after?.(); return; }
    setSpeaking(true);
    speak(text, {
      voice: jayVoiceRef.current,
      rate: 0.98,
      onEnd: () => { setSpeaking(false); after?.(); },
    });
  }, []);
  sayRef.current = say;

  // ── conversation turn ────────────────────────────────────────────────────────
  const sendUser = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || committedRef.current) return;
    interactedRef.current = true;
    stopSpeaking();
    setSpeaking(false);
    setInput('');

    const withUser: Msg[] = [...msgsRef.current, { role: 'user', text }];
    setMsgs(withUser);
    setThinking(true);
    try {
      const r = await api.post('/jay/converse', {
        transcript: withUser.map(m => ({ role: m.role, text: m.text })),
      });
      const { reply, sheet: newSheet, done: isDone } = r.data as { reply: string; sheet: Sheet; done: boolean };
      setThinking(false);
      setMsgs(m => [...m, { role: 'jay', text: reply }]);
      setSheet(newSheet || {});
      if (isDone) {
        setDone(true);
        void commit(newSheet || {});
        sayRef.current(reply);
      } else {
        sayRef.current(reply, () => {
          // Gemini-style hands-free loop: he finishes talking, you talk
          if (voiceModeRef.current && !committedRef.current) voiceRef.current.start();
        });
      }
    } catch {
      setThinking(false);
      setMsgs(m => [...m, { role: 'jay', text: "Sorry — I dropped that. Say it again?" }]);
    }
  }, []);

  // ── commit the sheet into every sector ───────────────────────────────────────
  const commit = useCallback(async (s?: Sheet) => {
    if (committedRef.current) return;
    committedRef.current = true;
    try {
      const r = await api.post('/jay/commit', { sheet: s ?? sheet });
      setFilled(r.data.filled || []);
    } catch {
      committedRef.current = false;
      setMsgs(m => [...m, { role: 'jay', text: "Hm, saving didn't go through. Hit save again for me?" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  // ── boot: greeting ────────────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    committedRef.current = false;
    voiceModeRef.current = false;
    stopSpeaking();
    setMsgs([]); setSheet({}); setDone(false); setFilled(null); setThinking(false);
    try {
      const r = await api.get('/jay/state');
      setAiLive(!!r.data.ai);
      setMsgs([{ role: 'jay', text: r.data.greeting }]);
    } catch {
      setMsgs([{ role: 'jay', text: "Hey. Talk to me — how's the day going?" }]);
    }
  }, []);
  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, thinking, filled]);

  const orbState: OrbState =
    voice.listening ? 'listening' : thinking ? 'thinking' : speaking ? 'speaking' : 'idle';

  const statusLine =
    filled ? 'All filled in. See you tomorrow.'
    : voice.listening ? 'Listening — just talk'
    : thinking ? 'Thinking…'
    : speaking ? 'Jay is talking'
    : done ? 'Wrapping up'
    : 'Tap the orb to talk, or type below';

  const hasUserTurn = msgs.some(m => m.role === 'user');
  const sheetHasAnything = Object.values(sheet).some(v =>
    Array.isArray(v) ? v.length : v && Object.keys(v).length);

  function toggleMic() {
    interactedRef.current = true;
    if (voice.listening) { voice.stop(); return; }
    stopSpeaking(); setSpeaking(false);
    voiceModeRef.current = true;
    voice.start();
  }

  return (
    <div className="space-y-4 paper-in">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: 'var(--t-faint)' }}>
            Your day, spoken
          </p>
          <h1 className="text-3xl font-bold text-head" style={{ fontFamily: "'Lora', serif" }}>Jay</h1>
        </div>
        <div className="flex items-center gap-2">
          {aiLive !== null && (
            <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded-full"
              style={{
                background: aiLive ? '#cf8a3e1a' : 'var(--s2)',
                color: aiLive ? '#cf8a3e' : 'var(--t-faint)',
                border: `1px solid ${aiLive ? '#cf8a3e35' : 'var(--b)'}`,
              }}>
              {aiLive ? 'Live' : 'Basic mode'}
            </span>
          )}
          <button onClick={() => { const v = !voiceOn; setVoiceOn(v); localStorage.setItem('jay_voice_on', v ? '1' : '0'); if (!v) { stopSpeaking(); setSpeaking(false); } }}
            title={voiceOn ? 'Mute Jay' : 'Unmute Jay'}
            className="tap w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: voiceOn ? JAY : 'var(--t-faint)' }}>
            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-start">
        {/* ── Conversation ── */}
        <div className="md:col-span-2 card-raised rounded-2xl overflow-hidden"
          style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>

          {/* Orb + status */}
          <div className="flex flex-col items-center pt-6 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
            <AxisOrb state={orbState} color={JAY} size={132} onTap={toggleMic} />
            <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--t-faint)' }}>{statusLine}</p>
          </div>

          {/* Transcript */}
          <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '44vh', minHeight: 180 }}>
            {msgs.map((m, i) => (
              <div key={i} className={`flex paper-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                  style={m.role === 'jay' ? {
                    background: 'var(--s2)',
                    border: '1px solid var(--b)',
                    borderRadius: '4px 16px 16px 14px',
                    color: 'var(--t-body)',
                    fontFamily: "'Lora', serif",
                  } : {
                    background: 'rgb(var(--accent-rgb) / 0.10)',
                    border: '1px solid rgb(var(--accent-rgb) / 0.22)',
                    borderRadius: '16px 4px 14px 16px',
                    color: 'var(--t-body)',
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
            {thinking && (
              <div className="flex items-center gap-1.5 px-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: JAY, animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
            )}
            {filled && (
              <div className="paper-in pt-1 space-y-1.5">
                <p className="text-[9px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--t-faint)' }}>
                  Filled in for you
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(filled.length ? filled : ['Nothing new to file today']).map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
                      style={{ background: '#cf8a3e14', border: '1px solid #cf8a3e30', color: '#cf8a3e' }}>
                      <Check size={11} /> {f}
                    </span>
                  ))}
                </div>
                <button onClick={() => void boot()}
                  className="tap inline-flex items-center gap-1.5 mt-1 text-[11px] px-3 py-1.5 rounded-xl"
                  style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-faint)' }}>
                  <RotateCcw size={11} /> New conversation
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row — type it when you can't speak */}
          <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--b)', background: 'var(--s2)' }}>
            {voice.supported && (
              <button onClick={toggleMic} disabled={!!filled}
                title={voice.listening ? 'Stop listening' : 'Talk to Jay'}
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
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); voiceModeRef.current = false; void sendUser(input); } }}
              placeholder={filled ? 'Conversation saved' : 'Or type it here…'}
              disabled={thinking || !!filled}
              className="flex-1 rounded-xl px-3.5 py-2.5 text-[13px] disabled:opacity-50"
              style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)', outline: 'none' }}
            />
            <button onClick={() => { voiceModeRef.current = false; void sendUser(input); }}
              disabled={!input.trim() || thinking || !!filled}
              className="tap shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              <Send size={15} />
            </button>
          </div>
        </div>

        {/* ── Jay's notes ── */}
        <div className="card rounded-2xl p-4 space-y-2"
          style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--t-faint)' }}>
              Jay's notes
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
              As you talk, he notes things down here — sleep, food, training, the lot. Nothing to fill in yourself.
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
                <BookOpen size={10} /> Journal draft
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--t-body)', fontFamily: "'Lora', serif" }}>
                {sheet.journal.text}
              </p>
            </div>
          ) : null}

          {hasUserTurn && !filled && (
            <button onClick={() => void commit()}
              className="tap w-full py-2.5 rounded-xl text-[13px] font-bold text-white mt-1"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              End & save everything
            </button>
          )}

          {/* Voice picker */}
          {voices.length > 0 && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--b)' }}>
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase mb-1" style={{ color: 'var(--t-faint)' }}>
                Jay's voice
              </p>
              <select
                value={jayVoice?.voiceURI || ''}
                onChange={e => { setVoiceURI(e.target.value); localStorage.setItem('jay_voice_uri', e.target.value); }}
                className="w-full text-[11px] rounded-lg px-2 py-1.5"
                style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }}>
                {voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name.replace(/\(.*?\)/g, '').trim()}</option>
                ))}
              </select>
              <p className="text-[9.5px] mt-1.5 leading-snug" style={{ color: 'var(--t-faint)' }}>
                Best sound: install a Premium voice — System Settings → Accessibility → Spoken Content → Manage Voices.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
