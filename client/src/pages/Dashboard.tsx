import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Flame, CheckSquare, BookOpen, Zap, Clock, ArrowRight, Dumbbell, Moon, Sparkles, Send, X, Mic, MicOff, Volume2, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData, DashboardSnapshot, PointsSummary, Task, CheckinResult } from '../types';
import { format } from 'date-fns';

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#22c55e',
};

const MOOD_EMOJI  = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOOD_LABEL  = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_COLOR  = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/* ── Streak card ── */
function StreakCard({ value, best, label, color, icon: Icon }: {
  value: number; best: number; label: string; color: string; icon: any;
}) {
  return (
    <div className="card px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Icon size={14} color={color} />
        <span className="text-[11px] font-medium" style={{ color: '#52525b' }}>best {best}</span>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight" style={{ color }}>{value}</p>
        <p className="text-xs mt-0.5" style={{ color: '#71717a' }}>{label} streak</p>
      </div>
    </div>
  );
}

/* ── Task row ── */
function TaskRow({ task }: { task: Task }) {
  const dot = PRIORITY_DOT[task.priority] ?? '#71717a';
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: dot }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-body truncate">{task.title}</p>
        {task.due_date && (
          <p className="text-[11px] mt-0.5" style={{ color: isOverdue ? '#ef4444' : '#52525b' }}>
            {isOverdue ? '⚠ overdue' : `due ${task.due_date}`}
          </p>
        )}
      </div>
      <span className="text-[11px] shrink-0 font-medium capitalize" style={{ color: dot }}>
        {task.priority}
      </span>
    </div>
  );
}

/* ── Snapshot mini-cards ── */
function fmtDuration(mins: number | null | undefined) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SnapshotSection({ snap }: { snap: DashboardSnapshot }) {
  const cards: { to: string; title: string; line1: string; line2?: string }[] = [];

  // Habits
  cards.push({
    to: '/habits',
    title: 'Habits',
    line1: snap.habitsTotal > 0 ? `${snap.habitsDone}/${snap.habitsTotal} done` : 'None set',
    line2: snap.habitsTotal > 0
      ? `${Math.round((snap.habitsDone / snap.habitsTotal) * 100)}%`
      : undefined,
  });

  // Sleep
  const sleepDur = snap.lastSleep ? fmtDuration(snap.lastSleep.duration_minutes) : null;
  cards.push({
    to: '/sleep',
    title: 'Sleep',
    line1: sleepDur ?? 'No log',
    line2: snap.lastSleep?.quality != null
      ? `quality ${snap.lastSleep.quality}/5`
      : snap.lastSleep?.date ?? undefined,
  });

  // Workout
  cards.push({
    to: '/workout',
    title: 'Workout',
    line1: snap.lastWorkout ? (snap.lastWorkout.name ?? 'Session') : 'No session',
    line2: snap.lastWorkout?.date ?? undefined,
  });

  // Calories
  cards.push({
    to: '/diet',
    title: 'Calories',
    line1: snap.todayCalories != null ? `${snap.todayCalories} kcal` : 'Not logged',
    line2: snap.todayProtein != null ? `${snap.todayProtein}g protein` : undefined,
  });

  // Body
  cards.push({
    to: '/body',
    title: 'Body',
    line1: snap.latestBody?.weight_kg != null ? `${snap.latestBody.weight_kg} kg` : 'No data',
    line2: snap.latestBody?.body_fat_pct != null
      ? `${snap.latestBody.body_fat_pct}% body fat`
      : snap.latestBody?.date ?? undefined,
  });

  // Finance
  const net = (snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0);
  cards.push({
    to: '/finance',
    title: 'Finance',
    line1: snap.financeIncome != null || snap.financeExpenses != null
      ? `▲ ${snap.financeIncome ?? 0} / ▼ ${snap.financeExpenses ?? 0}`
      : 'No entries',
    line2: snap.financeIncome != null || snap.financeExpenses != null
      ? `net ${net >= 0 ? '+' : ''}${Math.round(net * 100) / 100}`
      : undefined,
  });

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: '#52525b', letterSpacing: '0.05em' }}>TODAY AT A GLANCE</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {cards.map(c => (
          <Link key={c.to} to={c.to} className="card px-3 py-3 flex flex-col gap-1 min-w-[110px] shrink-0 no-underline">
            <p className="text-[11px] font-semibold" style={{ color: '#52525b' }}>{c.title}</p>
            <p className="text-sm font-bold text-head leading-tight">{c.line1}</p>
            {c.line2 && <p className="text-[11px]" style={{ color: '#71717a' }}>{c.line2}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Score card ── */
const LEVEL_COLORS = ['','#6366f1','#3b82f6','#22c55e','#f97316','#ef4444','#a855f7'];

function ScoreCard({ pts }: { pts: PointsSummary }) {
  const color = LEVEL_COLORS[pts.level] ?? '#6366f1';
  return (
    <div className="card px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}22`, color }}>
            LVL {pts.level}
          </span>
          <span className="text-xs font-semibold" style={{ color }}>{pts.levelLabel}</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-head tabular-nums">{pts.total.toLocaleString()}</span>
          <span className="text-xs ml-1" style={{ color: '#52525b' }}>pts</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full w-full mb-1.5" style={{ background: 'var(--s3)' }}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pts.progressPct}%`, background: color }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px]" style={{ color: '#52525b' }}>
          {pts.today > 0 ? `+${pts.today} today` : 'Earn pts by completing tasks, logging habits & more'}
        </span>
        <span className="text-[10px]" style={{ color: '#52525b' }}>
          {pts.nextLevel != null ? `${pts.nextLevel} to next level` : 'Max level'}
        </span>
      </div>
    </div>
  );
}

/* ── Section header ── */
function Section({ icon: Icon, iconColor, title, action, count }: {
  icon: any; iconColor: string; title: string;
  action?: { label: string; to: string };
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} color={iconColor} />
      <span className="text-sm font-semibold text-head flex-1">{title}</span>
      {count !== undefined && (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--s3)', color: count > 0 ? '#f87171' : '#52525b' }}>
          {count}
        </span>
      )}
      {action && (
        <Link to={action.to}
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: 'rgb(var(--accent-rgb-light))' }}>
          {action.label} <ArrowRight size={10} />
        </Link>
      )}
    </div>
  );
}

/* ── Daily check-in ── */
const MOOD_EMOJI_MAP = ['', '😞', '😕', '😐', '🙂', '😄'];

// Guided conversation questions
const CONVO_QUESTIONS = [
  "Hey! How are you feeling today — mentally and physically?",
  "How did you sleep last night? What time did you go to bed and wake up?",
  "Did you work out or do any exercise today? What did you get into?",
  "What tasks or goals did you knock out today?",
  "Anything else on your mind — wins, struggles, or anything you want to note?",
];
const CONVO_TRANSITIONS = [
  "Got it.", "Noted.", "Nice.", "Got that.", "Okay.",
];

// Get the SpeechRecognition constructor cross-browser (typed as any — not in default TS DOM lib)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const en = all.filter(v => v.lang.startsWith('en'));
      if (en.length) setVoices(en);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

// Pick the best available English voice — Google neural > Microsoft neural > Apple > fallback
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return (
    voices.find(v => /google uk english female/i.test(v.name)) ||
    voices.find(v => /google us english/i.test(v.name)) ||
    voices.find(v => /microsoft.*aria.*online|microsoft.*jenny.*online|microsoft.*sonia.*online/i.test(v.name)) ||
    voices.find(v => /microsoft (aria|jenny|zira|natasha|hazel|sonia)/i.test(v.name)) ||
    voices.find(v => /samantha|karen|tessa|moira/i.test(v.name)) ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.lang === 'en-US') ||
    voices[0]
  );
}

function speak(text: string, voice: SpeechSynthesisVoice | null, onEnd?: () => void) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.93;   // slightly slower = more natural
  utt.pitch = 1.06;  // slightly warmer tone
  utt.volume = 1.0;
  if (voice) utt.voice = voice;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

function DailyCheckin({ onCheckinDone }: { onCheckinDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `checkin_${today}`;
  const voiceKey = 'checkin_voice_name';

  const voices = useSpeechVoices();
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(
    () => localStorage.getItem(voiceKey) ?? ''
  );
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const selectedVoice = voices.find(v => v.name === selectedVoiceName) ?? pickBestVoice(voices);

  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'done');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');

  // Basic dictation state
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');

  // Conversation mode state
  const [convoActive, setConvoActive] = useState(false);
  const [convoStep, setConvoStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const srRef = useRef<any>(null);
  const baseTextRef = useRef('');
  const convoAnswersRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-pick best voice when voices load
  useEffect(() => {
    if (!voices.length || selectedVoiceName) return;
    const best = pickBestVoice(voices);
    if (best) {
      setSelectedVoiceName(best.name);
      localStorage.setItem(voiceKey, best.name);
    }
  }, [voices, selectedVoiceName]);

  // Focus textarea when opened (type mode only)
  useEffect(() => {
    if (open && !result && !convoActive && taRef.current) taRef.current.focus();
  }, [open, result, convoActive]);

  function pickVoice(v: SpeechSynthesisVoice) {
    setSelectedVoiceName(v.name);
    localStorage.setItem(voiceKey, v.name);
    setShowVoicePicker(false);
    speak("Got it, I'll use this voice.", v);
  }

  // ── Conversation mode ─────────────────────────────────────────────────────
  function startListeningForAnswer(step: number) {
    if (!SR) return;
    const sr = new SR();
    srRef.current = sr;
    sr.lang = 'en-US';
    sr.continuous = true;
    sr.interimResults = true;

    let currentAnswer = '';

    sr.onstart = () => setListening(true);

    sr.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          currentAnswer += (currentAnswer ? ' ' : '') + t.trim();
        } else {
          interim = t;
        }
      }
      setInterimText(interim);
      // Reset silence timer on every speech event
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (currentAnswer) {
        silenceTimerRef.current = setTimeout(() => sr.stop(), 1800);
      }
    };

    sr.onerror = () => { setListening(false); setInterimText(''); handleConvoAnswer(step, currentAnswer); };
    sr.onend = () => {
      setListening(false);
      setInterimText('');
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      handleConvoAnswer(step, currentAnswer);
    };

    sr.start();
  }

  function handleConvoAnswer(step: number, answer: string) {
    if (answer.trim()) {
      convoAnswersRef.current = [...convoAnswersRef.current, answer.trim()];
      const combined = convoAnswersRef.current.join('. ');
      setText(combined);
      baseTextRef.current = combined;
    }

    const nextStep = step + 1;
    if (nextStep < CONVO_QUESTIONS.length) {
      setConvoStep(nextStep);
      const transition = answer.trim() ? CONVO_TRANSITIONS[step % CONVO_TRANSITIONS.length] + ' ' : '';
      setTimeout(() => {
        setSpeaking(true);
        speak(transition + CONVO_QUESTIONS[nextStep], selectedVoice ?? null, () => {
          setSpeaking(false);
          startListeningForAnswer(nextStep);
        });
      }, 350);
    } else {
      // All questions done → auto-submit
      setConvoActive(false);
      setSpeaking(true);
      speak("Perfect. Let me log all of that for you now.", selectedVoice ?? null, () => {
        setSpeaking(false);
        const finalText = convoAnswersRef.current.join('. ');
        if (finalText.trim()) submitText(finalText);
      });
    }
  }

  function startConversation() {
    if (!SR) return;
    convoAnswersRef.current = [];
    setText('');
    baseTextRef.current = '';
    setConvoActive(true);
    setConvoStep(0);
    setError('');
    setSpeaking(true);
    speak(CONVO_QUESTIONS[0], selectedVoice ?? null, () => {
      setSpeaking(false);
      startListeningForAnswer(0);
    });
  }

  function stopConversation() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    srRef.current?.stop();
    window.speechSynthesis?.cancel();
    setConvoActive(false);
    setSpeaking(false);
    setListening(false);
    setInterimText('');
  }

  // ── Basic dictation (tap-to-talk, no guided questions) ────────────────────
  function toggleDictation() {
    if (!SR) return;
    if (listening) { srRef.current?.stop(); return; }
    const sr = new SR();
    srRef.current = sr;
    sr.lang = 'en-US';
    sr.continuous = true;
    sr.interimResults = true;
    baseTextRef.current = text;

    sr.onstart = () => setListening(true);
    sr.onresult = (e: any) => {
      let interim = '';
      let final = baseTextRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += (final ? ' ' : '') + t.trim(); baseTextRef.current = final; }
        else interim = t;
      }
      setText(final + (interim ? ' ' + interim : ''));
      setInterimText(interim);
    };
    sr.onerror = () => { setListening(false); setInterimText(''); };
    sr.onend = () => { setListening(false); setInterimText(''); setText(baseTextRef.current); };
    sr.start();
  }

  // ── Submit helpers ────────────────────────────────────────────────────────
  async function submitText(payload: string) {
    if (!payload.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<CheckinResult>('/checkin', { text: payload });
      setResult(res.data);
      localStorage.setItem(storageKey, 'done');
      onCheckinDone();
      if (res.data.friendly_response) {
        setTimeout(() => speak(res.data.friendly_response, selectedVoice ?? null), 400);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (listening) srRef.current?.stop();
    submitText(text);
  }

  function dismiss() {
    stopConversation();
    setOpen(false);
    localStorage.setItem(storageKey, 'done');
  }

  function reopen() {
    setOpen(true);
    setResult(null);
    setText('');
    setError('');
    setListening(false);
    setInterimText('');
    setConvoActive(false);
  }

  if (!open) {
    return (
      <button onClick={reopen}
        className="w-full text-left card px-4 py-3 flex items-center gap-2"
        style={{ color: 'rgb(var(--accent-rgb-light))' }}>
        <Sparkles size={14} />
        <span className="text-xs font-medium">Log your check-in for today</span>
      </button>
    );
  }

  const voiceLabel = selectedVoice ? selectedVoice.name.replace(/\s*\(.*?\)/g, '').trim() : 'Voice';

  return (
    <div className="card px-4 py-4 space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: 'rgb(var(--accent-rgb-light))' }} />
          <span className="text-sm font-semibold text-head">Daily Check-in</span>
        </div>
        <div className="flex items-center gap-2">
          {voices.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowVoicePicker(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium tap"
                style={{ background: 'var(--s2)', color: '#71717a', border: '1px solid var(--b)' }}>
                <Volume2 size={11} />{voiceLabel}<ChevronDown size={10} />
              </button>
              {showVoicePicker && (
                <div className="absolute right-0 top-7 z-50 rounded-xl p-2 shadow-xl"
                  style={{ background: 'var(--s1)', border: '1px solid var(--b)', minWidth: 190, maxHeight: 220, overflowY: 'auto' }}>
                  <p className="text-[10px] font-semibold px-2 pb-1.5" style={{ color: '#52525b', letterSpacing: '0.06em' }}>ENGLISH VOICES</p>
                  {voices.map(v => (
                    <button key={v.name} onClick={() => pickVoice(v)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs tap"
                      style={{
                        color: v.name === selectedVoiceName ? 'rgb(var(--accent-rgb-light))' : '#a1a1aa',
                        background: v.name === selectedVoiceName ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent',
                        fontWeight: v.name === selectedVoiceName ? 600 : 400,
                      }}>
                      {v.name.replace(/\s*\(.*?\)/g, '')}
                      <span className="ml-1 text-[9px]" style={{ color: '#52525b' }}>{v.lang}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={dismiss} className="tap" style={{ color: '#52525b' }}><X size={14} /></button>
        </div>
      </div>

      {result ? (
        /* ── Result ── */
        <div className="space-y-3">
          <div className="rounded-xl px-3 py-3 space-y-2"
            style={{ background: 'rgb(var(--accent-rgb) / 0.07)', border: '1px solid rgb(var(--accent-rgb) / 0.15)' }}>
            <div className="flex items-center justify-between">
              {result.mood ? (
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{MOOD_EMOJI_MAP[result.mood]}</span>
                  <span className="text-xs font-semibold" style={{ color: 'rgb(var(--accent-rgb-light))' }}>Mood detected</span>
                </div>
              ) : <span />}
              {voices.length > 0 && (
                <button onClick={() => speak(result.friendly_response, selectedVoice ?? null)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] tap"
                  style={{ background: 'var(--s2)', color: '#71717a', border: '1px solid var(--b)' }}>
                  <Volume2 size={11} /> Replay
                </button>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#a1a1aa' }}>{result.friendly_response}</p>
          </div>
          {result.actions_taken.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.actions_taken.map((a, i) => (
                <span key={i} className="text-[11px] font-medium px-2 py-1 rounded-lg"
                  style={{ background: 'var(--s2)', color: '#a1a1aa', border: '1px solid var(--b)' }}>{a}</span>
              ))}
            </div>
          )}
          <button onClick={reopen} className="text-[11px] underline tap" style={{ color: '#52525b' }}>Log again</button>
        </div>

      ) : convoActive ? (
        /* ── Conversation mode ── */
        <div className="space-y-3">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {CONVO_QUESTIONS.map((_, i) => (
              <span key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: i === convoStep ? 18 : 6, height: 6,
                  background: i < convoStep
                    ? 'rgb(var(--accent-rgb) / 0.4)'
                    : i === convoStep
                    ? 'rgb(var(--accent-rgb))'
                    : 'var(--s3)',
                }} />
            ))}
            <span className="text-[10px] ml-1" style={{ color: 'var(--t-faint)' }}>
              {convoStep + 1} / {CONVO_QUESTIONS.length}
            </span>
          </div>

          {/* Current question bubble */}
          <div className="rounded-xl px-3 py-3"
            style={{ background: 'rgb(var(--accent-rgb) / 0.07)', border: '1px solid rgb(var(--accent-rgb) / 0.18)' }}>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
              {CONVO_QUESTIONS[convoStep]}
            </p>
          </div>

          {/* Speaking / listening indicator */}
          <div className="flex items-center gap-2 min-h-[24px]">
            {speaking ? (
              <>
                {[0, 80, 160, 100, 200, 130, 60].map((delay, i) => (
                  <span key={i} className="waveform-bar"
                    style={{ height: 16, background: 'rgb(var(--accent-rgb-light))', animationDelay: `${delay}ms`, opacity: 0.7 }} />
                ))}
                <span className="text-[11px] ml-1" style={{ color: 'rgb(var(--accent-rgb-light))' }}>speaking…</span>
              </>
            ) : listening ? (
              <>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                {[0, 80, 160, 100, 200, 130, 60].map((delay, i) => (
                  <span key={i} className="waveform-bar"
                    style={{ height: 16, background: '#ef4444', animationDelay: `${delay}ms`, opacity: 0.7 }} />
                ))}
                <span className="text-[11px] ml-1" style={{ color: '#ef4444' }}>
                  {interimText || 'listening…'}
                </span>
              </>
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--t-faint)' }}>processing…</span>
            )}
          </div>

          {/* Accumulated transcript preview */}
          {text && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
              <p className="text-[11px]" style={{ color: 'var(--t-muted)' }}>{text}</p>
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

          <div className="flex items-center gap-2">
            <button onClick={stopConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tap"
              style={{ background: 'var(--s2)', color: '#71717a', border: '1px solid var(--b)' }}>
              <X size={11} /> Stop
            </button>
            {text && (
              <button onClick={() => { stopConversation(); submitText(text); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tap"
                style={{ background: 'rgb(var(--accent-rgb))', color: '#fff' }}>
                <Send size={11} /> Log what I have
              </button>
            )}
          </div>
        </div>

      ) : (
        /* ── Type / basic dictation mode ── */
        <>
          <p className="text-xs" style={{ color: '#71717a' }}>
            {SR ? 'Tap 🎙 to talk through questions, or just type below.' : 'How was your day? Vent, reflect, log anything.'}
          </p>

          <div className="relative">
            <textarea ref={taRef} rows={4} value={text}
              onChange={e => { setText(e.target.value); baseTextRef.current = e.target.value; }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder="Slept at 11, woke at 7. Hit the gym, finished the project proposal. Feeling good but a bit tired…"
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
              style={{
                background: 'var(--s2)',
                border: `1px solid ${listening ? 'rgb(var(--accent-rgb) / 0.5)' : 'var(--b)'}`,
                color: '#a1a1aa', transition: 'border-color 0.2s',
              }} />
            {listening && interimText && (
              <p className="absolute bottom-2.5 left-3 right-3 text-sm pointer-events-none truncate"
                style={{ color: 'rgb(var(--accent-rgb-light))', opacity: 0.5 }}>{interimText}…</p>
            )}
          </div>

          {listening && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
              <span className="text-xs" style={{ color: '#ef4444' }}>Listening… speak naturally</span>
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

          <div className="flex items-center gap-2">
            {SR ? (
              <>
                {/* Conversation mode button */}
                <button onClick={startConversation}
                  className="relative shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold tap transition-all"
                  style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'rgb(var(--accent-rgb-light))', border: '1px solid rgb(var(--accent-rgb) / 0.25)' }}
                  title="Start guided voice check-in">
                  <Mic size={12} /> Talk to me
                </button>
                {/* Dictation-only button */}
                <div className="relative shrink-0" style={{ width: 32, height: 32 }}>
                  {listening && (
                    <>
                      <span className="mic-ring" />
                      <span className="mic-ring mic-ring-2" />
                      <span className="mic-ring mic-ring-3" />
                    </>
                  )}
                  <button onClick={toggleDictation}
                    className={`flex items-center justify-center w-8 h-8 rounded-xl tap transition-all ${listening ? 'mic-listening' : ''}`}
                    style={{
                      background: listening ? '#ef4444' : 'var(--s2)',
                      color: listening ? '#fff' : 'var(--t-dim)',
                      border: listening ? 'none' : '1px solid var(--b)',
                      position: 'relative', zIndex: 1,
                    }}
                    title={listening ? 'Stop dictation' : 'Dictate freely'}>
                    {listening ? <MicOff size={12} /> : <MicOff size={12} style={{ opacity: 0.5 }} />}
                  </button>
                </div>
              </>
            ) : null}

            {listening ? (
              <div className="flex items-end gap-0.5 flex-1" style={{ height: 18 }}>
                {[0, 80, 160, 100, 200, 130, 60].map((delay, i) => (
                  <span key={i} className="waveform-bar"
                    style={{ height: '100%', background: 'rgb(var(--accent-rgb-light))', animationDelay: `${delay}ms`, opacity: 0.8 }} />
                ))}
              </div>
            ) : (
              <span className="text-[10px] flex-1" style={{ color: 'var(--t-faint)' }}>
                {SR ? '⌘↵ to submit' : '⌘↵ to submit'}
              </span>
            )}

            <button onClick={submit} disabled={loading || !text.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 tap"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {loading ? <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" /> : <Send size={11} />}
              {loading ? 'Logging…' : 'Log it'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Dashboard ── */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>('/dashboard');
    setData(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 60000);

  if (!data) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgb(var(--accent-rgb))', borderTopColor: 'transparent' }} />
    </div>
  );

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const remaining = stats.totalTasks - stats.completedTasks;
  const pct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="max-w-xl space-y-3 anim-page">

      {/* ── Greeting ── */}
      <div className="mb-5">
        <p className="text-xs font-medium mb-1" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
          {format(new Date(), 'EEEE, d MMMM yyyy').toUpperCase()}
        </p>
        <h1 className="text-2xl font-bold text-head tracking-tight">
          Good {getGreeting()}{user?.username ? `, ${user.username}` : ''}
        </h1>
        <p className="text-sm mt-1" style={{ color: '#71717a' }}>
          {pct === 100 && stats.totalTasks > 0
            ? 'Every task done. Outstanding.'
            : remaining > 0
            ? `${remaining} task${remaining !== 1 ? 's' : ''} remaining today`
            : 'No tasks yet — add something to work on'}
        </p>
      </div>

      {/* ── Score ── */}
      {data.points && <ScoreCard pts={data.points} />}

      {/* ── Daily Check-in ── */}
      <DailyCheckin onCheckinDone={load} />

      {/* ── Streaks ── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <StreakCard value={streaks.tasks?.current   ?? 0} best={streaks.tasks?.longest   ?? 0} label="tasks"   color="#6366f1" icon={CheckSquare} />
        <StreakCard value={streaks.journal?.current ?? 0} best={streaks.journal?.longest ?? 0} label="journal" color="#a855f7" icon={BookOpen}   />
        <StreakCard value={streaks.overall?.current ?? 0} best={streaks.overall?.longest ?? 0} label="overall" color="#f97316" icon={Flame}      />
        <StreakCard value={streaks.workout?.current ?? 0} best={streaks.workout?.longest ?? 0} label="workout" color="#f97316" icon={Dumbbell}   />
        <StreakCard value={streaks.sleep?.current   ?? 0} best={streaks.sleep?.longest   ?? 0} label="sleep"   color="#6366f1" icon={Moon}       />
      </div>

      {/* ── Today at a glance ── */}
      {data.snapshot && <SnapshotSection snap={data.snapshot} />}

      {/* ── Task progress ── */}
      {stats.totalTasks > 0 && (
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold text-head">Today</span>
            <span className="text-sm font-bold text-head tabular-nums">
              {stats.completedTasks}
              <span style={{ color: '#52525b' }}>/{stats.totalTasks}</span>
            </span>
          </div>
          <div className="h-1 rounded-full w-full" style={{ background: 'var(--s3)' }}>
            <div className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: `rgb(var(--accent-rgb))` }} />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[11px]" style={{ color: '#52525b' }}>{pct}% complete</span>
            <span className="text-[11px]" style={{ color: '#52525b' }}>{stats.totalJournal} journal entries</span>
          </div>
        </div>
      )}

      {/* ── Focus queue + Due today ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

        <div className="card px-4 py-4">
          <Section icon={Zap} iconColor="#eab308" title="Focus Queue" action={{ label: 'All', to: '/tasks' }} />
          {priorityQueue.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: '#52525b' }}>All caught up</p>
          ) : (
            <div className="[&>*:last-child]:border-0">
              {priorityQueue.slice(0, 4).map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>

        <div className="card px-4 py-4">
          <Section icon={Clock} iconColor="#ef4444" title="Due Today" count={pendingToday.length} />
          {pendingToday.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: '#52525b' }}>Clear for today</p>
          ) : (
            <div className="[&>*:last-child]:border-0">
              {pendingToday.slice(0, 4).map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Journal ── */}
      <div className="card px-4 py-4">
        <Section icon={BookOpen} iconColor="#a855f7" title="Today's Journal"
          action={{ label: journal ? 'Edit' : 'Write', to: '/journal' }} />
        {journal ? (
          <div className="space-y-2">
            {journal.mood && (
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{MOOD_EMOJI[journal.mood]}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: MOOD_COLOR[journal.mood], background: MOOD_COLOR[journal.mood] + '18' }}>
                  {MOOD_LABEL[journal.mood]}
                </span>
              </div>
            )}
            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: '#a1a1aa' }}>
              {journal.content}
            </p>
          </div>
        ) : (
          <Link to="/journal"
            className="flex items-center justify-center gap-2 py-4 text-sm font-medium rounded-lg transition-colors"
            style={{ color: 'rgb(var(--accent-rgb-light))', background: 'rgb(var(--accent-rgb) / 0.06)' }}>
            Write today's entry <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* ── 100% badge ── */}
      {pct === 100 && stats.totalTasks > 0 && (
        <div className="card px-4 py-4 text-center" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
          <p className="text-xl mb-1">🏆</p>
          <p className="text-sm font-bold" style={{ color: '#22c55e' }}>All done for today</p>
        </div>
      )}

    </div>
  );
}
