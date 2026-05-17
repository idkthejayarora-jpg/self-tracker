import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, CheckSquare, BookOpen, Zap, ArrowRight, Dumbbell, Moon,
  Send, X, Mic, MicOff, Volume2, ChevronDown, Plus, Target,
  Wallet, AlertTriangle, ArrowUp, Minus, ChevronDown as ChevDown,
  TrendingUp, Coffee, Activity, BarChart2, CheckCircle2, Circle,
  MessageSquare, Award, ChevronRight, Swords,
} from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData, DashboardSnapshot, PointsSummary, Task, CheckinResult } from '../types';
import { format } from 'date-fns';

/* ── Priority config ── */
const PRIORITY: Record<string, { color: string; icon: any; label: string }> = {
  urgent: { color: '#f43f5e', icon: AlertTriangle, label: 'URGENT' },
  high:   { color: '#f97316', icon: ArrowUp,       label: 'HIGH'   },
  medium: { color: '#eab308', icon: Minus,         label: 'MED'    },
  low:    { color: '#22c55e', icon: ChevDown,      label: 'LOW'    },
};

const MOOD_LABEL = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_COLOR = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
const LEVEL_COLORS = ['','#6366f1','#3b82f6','#22c55e','#f97316','#ef4444','#a855f7'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/* ── Section label ── */
function SysLabel({ icon: Icon, text, color }: { icon?: any; text: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {Icon && <Icon size={11} style={{ color: color ?? 'var(--cyan)', opacity: 0.8 }} />}
      <span className="sys-label" style={{ color: color ? `${color}cc` : undefined }}>{text}</span>
    </div>
  );
}

/* ── Mission card (task as quest) ── */
function MissionCard({ task, onComplete }: { task: Task; onComplete: (id: number) => void }) {
  const p = PRIORITY[task.priority] ?? PRIORITY.low;
  const PIcon = p.icon;
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  const [completing, setCompleting] = useState(false);

  async function complete() {
    setCompleting(true);
    try {
      await api.patch(`/tasks/${task.id}`, { status: 'completed' });
      onComplete(task.id);
    } catch (_) { setCompleting(false); }
  }

  return (
    <div className="mission-card group">
      {/* Priority indicator */}
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <div className="w-1 h-8 rounded-full shrink-0" style={{ background: p.color, boxShadow: `0 0 5px ${p.color}60` }} />
        <PIcon size={11} style={{ color: p.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-head truncate leading-tight">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ background: `${p.color}18`, color: p.color }}>{p.label}</span>
          {task.due_date && (
            <span className="text-[10px] flex items-center gap-1"
              style={{ color: isOverdue ? '#f87171' : 'var(--t-faint)' }}>
              {isOverdue && <AlertTriangle size={8} />}
              {task.due_date}
            </span>
          )}
        </div>
      </div>
      {/* Complete button */}
      <button
        onClick={complete}
        disabled={completing}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-all"
        style={{ background: '#22c55e15', border: '1px solid #22c55e30', color: '#22c55e' }}
        title="Complete mission">
        {completing
          ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
          : <CheckCircle2 size={14} />}
      </button>
    </div>
  );
}

/* ── Stat duration helper ── */
function fmtDuration(mins: number | null | undefined) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ── Snapshot cards ── */
function SnapshotSection({ snap }: { snap: DashboardSnapshot }) {
  const cards = [
    {
      to: '/habits', icon: Target, color: '#f97316',
      label: 'Habits',
      primary: snap.habitsTotal > 0 ? `${snap.habitsDone}/${snap.habitsTotal}` : '—',
      sub: snap.habitsTotal > 0 ? `${Math.round((snap.habitsDone / snap.habitsTotal) * 100)}% done` : 'None set',
    },
    {
      to: '/sleep', icon: Moon, color: '#818cf8',
      label: 'Sleep',
      primary: fmtDuration(snap.lastSleep?.duration_minutes) ?? '—',
      sub: snap.lastSleep?.quality ? `Quality ${snap.lastSleep.quality}/5` : snap.lastSleep?.date ?? 'Not logged',
    },
    {
      to: '/workout', icon: Dumbbell, color: '#ef4444',
      label: 'Workout',
      primary: snap.lastWorkout ? 'Done' : '—',
      sub: snap.lastWorkout ? (snap.lastWorkout.name ?? snap.lastWorkout.date) : 'No session',
    },
    {
      to: '/diet', icon: Coffee, color: '#22c55e',
      label: 'Calories',
      primary: snap.todayCalories != null ? `${snap.todayCalories}` : '—',
      sub: snap.todayCalories != null ? `${snap.todayProtein ?? 0}g protein` : 'Not logged',
    },
    {
      to: '/body', icon: Activity, color: '#06b6d4',
      label: 'Body',
      primary: snap.latestBody?.weight_kg != null ? `${snap.latestBody.weight_kg}kg` : '—',
      sub: snap.latestBody?.body_fat_pct != null ? `${snap.latestBody.body_fat_pct}% fat` : snap.latestBody?.date ?? 'No data',
    },
    {
      to: '/finance', icon: Wallet, color: '#f59e0b',
      label: 'Finance',
      primary: snap.financeIncome != null || snap.financeExpenses != null
        ? `${(snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0) >= 0 ? '+' : ''}${Math.round(((snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0)) * 10) / 10}`
        : '—',
      sub: snap.financeIncome != null ? `↑${snap.financeIncome} ↓${snap.financeExpenses ?? 0}` : 'No entries',
    },
  ];

  return (
    <div>
      <SysLabel icon={BarChart2} text="System Status" />
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scroll">
        {cards.map(c => (
          <Link key={c.to} to={c.to}
            className="streak-node card-hover glow-card flex flex-col gap-1 no-underline"
            style={{ minWidth: 86, textDecoration: 'none', '--gc': `${c.color}55` } as React.CSSProperties}>
            <c.icon size={13} style={{ color: c.color }} />
            <p className="text-sm font-black text-head tabular-nums font-mono leading-tight mt-1">{c.primary}</p>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--t-faint)' }}>{c.label}</p>
            <p className="text-[9px]" style={{ color: 'var(--t-faint)', opacity: 0.7 }}>{c.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Rank/XP panel ── */
function RankPanel({ pts }: { pts: PointsSummary }) {
  const color = LEVEL_COLORS[pts.level] ?? '#6366f1';
  return (
    <div className="cmd-card border-glow-anim px-5 py-4 relative overflow-hidden">
      {/* Shimmer sheen */}
      <div className="shimmer-slide" />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
            <Award size={18} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                LVL {pts.level}
              </span>
              <span className="text-sm font-bold" style={{ color }}>{pts.levelLabel}</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>
              {pts.today > 0 ? (
                <span className="flex items-center gap-1">
                  <Zap size={10} style={{ color: '#f59e0b' }} />
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>+{pts.today} XP</span>
                  <span>earned today</span>
                </span>
              ) : 'Complete tasks, habits & logs to earn XP'}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-head tabular-nums font-mono">{pts.total.toLocaleString()}</p>
          <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>total XP</p>
        </div>
      </div>
      {/* XP bar */}
      <div className="xp-track mb-1.5">
        <div className="xp-fill bar-fill" style={{ width: `${pts.progressPct}%`, background: color, boxShadow: `0 0 8px ${color}60` }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{pts.progressPct}% to next level</span>
        <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
          {pts.nextLevel != null ? `${pts.nextLevel.toLocaleString()} XP needed` : '⚡ Max level'}
        </span>
      </div>
    </div>
  );
}

/* ── Quick actions ── */
const ACTIONS = [
  { to: '/tasks',   icon: Plus,     label: 'New Mission',   color: '#6366f1' },
  { to: '/workout', icon: Dumbbell, label: 'Log Training',  color: '#ef4444' },
  { to: '/sleep',   icon: Moon,     label: 'Log Sleep',     color: '#818cf8' },
  { to: '/journal', icon: BookOpen, label: 'Write Entry',   color: '#a855f7' },
  { to: '/habits',  icon: Target,   label: 'Check Habits',  color: '#f97316' },
  { to: '/finance', icon: Wallet,   label: 'Log Finance',   color: '#f59e0b' },
];

/* ══════════════════════════════════════════════════════════════
   DAILY CHECK-IN — all original logic preserved, UI restyled
══════════════════════════════════════════════════════════════ */
const CONVO_QUESTIONS = [
  "Hey! How are you feeling today — mentally and physically?",
  "How did you sleep last night? What time did you go to bed and wake up?",
  "Did you work out or do any exercise today? What did you get into?",
  "What tasks or goals did you knock out today?",
  "Anything else on your mind — wins, struggles, or anything you want to note?",
];
const CONVO_TRANSITIONS = ["Got it.", "Noted.", "Nice.", "Got that.", "Okay."];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;

function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => { const en = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')); if (en.length) setVoices(en); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

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
  utt.lang = 'en-US'; utt.rate = 0.93; utt.pitch = 1.06; utt.volume = 1.0;
  if (voice) utt.voice = voice;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

function DailyCheckin({ onCheckinDone }: { onCheckinDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `checkin_${today}`;
  const voiceKey = 'checkin_voice_name';

  const voices = useSpeechVoices();
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(() => localStorage.getItem(voiceKey) ?? '');
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const selectedVoice = voices.find(v => v.name === selectedVoiceName) ?? pickBestVoice(voices);

  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'done');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [convoActive, setConvoActive] = useState(false);
  const [convoStep, setConvoStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const srRef = useRef<any>(null);
  const baseTextRef = useRef('');
  const convoAnswersRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!voices.length || selectedVoiceName) return;
    const best = pickBestVoice(voices);
    if (best) { setSelectedVoiceName(best.name); localStorage.setItem(voiceKey, best.name); }
  }, [voices, selectedVoiceName]);

  useEffect(() => {
    if (open && !result && !convoActive && taRef.current) taRef.current.focus();
  }, [open, result, convoActive]);

  function pickVoice(v: SpeechSynthesisVoice) {
    setSelectedVoiceName(v.name); localStorage.setItem(voiceKey, v.name);
    setShowVoicePicker(false); speak("Got it, I'll use this voice.", v);
  }

  function startListeningForAnswer(step: number) {
    if (!SR) return;
    const sr = new SR(); srRef.current = sr;
    sr.lang = 'en-US'; sr.continuous = true; sr.interimResults = true;
    let currentAnswer = '';
    sr.onstart = () => setListening(true);
    sr.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) currentAnswer += (currentAnswer ? ' ' : '') + t.trim();
        else interim = t;
      }
      setInterimText(interim);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (currentAnswer) silenceTimerRef.current = setTimeout(() => sr.stop(), 1800);
    };
    sr.onerror = () => { setListening(false); setInterimText(''); handleConvoAnswer(step, currentAnswer); };
    sr.onend = () => {
      setListening(false); setInterimText('');
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      handleConvoAnswer(step, currentAnswer);
    };
    sr.start();
  }

  function handleConvoAnswer(step: number, answer: string) {
    if (answer.trim()) {
      convoAnswersRef.current = [...convoAnswersRef.current, answer.trim()];
      const combined = convoAnswersRef.current.join('. ');
      setText(combined); baseTextRef.current = combined;
    }
    const nextStep = step + 1;
    if (nextStep < CONVO_QUESTIONS.length) {
      setConvoStep(nextStep);
      const transition = answer.trim() ? CONVO_TRANSITIONS[step % CONVO_TRANSITIONS.length] + ' ' : '';
      setTimeout(() => { setSpeaking(true); speak(transition + CONVO_QUESTIONS[nextStep], selectedVoice ?? null, () => { setSpeaking(false); startListeningForAnswer(nextStep); }); }, 350);
    } else {
      setConvoActive(false); setSpeaking(true);
      speak("Perfect. Let me log all of that for you now.", selectedVoice ?? null, () => {
        setSpeaking(false);
        const finalText = convoAnswersRef.current.join('. ');
        if (finalText.trim()) submitText(finalText);
      });
    }
  }

  function startConversation() {
    if (!SR) return;
    convoAnswersRef.current = []; setText(''); baseTextRef.current = '';
    setConvoActive(true); setConvoStep(0); setError(''); setSpeaking(true);
    speak(CONVO_QUESTIONS[0], selectedVoice ?? null, () => { setSpeaking(false); startListeningForAnswer(0); });
  }

  function stopConversation() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    srRef.current?.stop(); window.speechSynthesis?.cancel();
    setConvoActive(false); setSpeaking(false); setListening(false); setInterimText('');
  }

  function toggleDictation() {
    if (!SR) return;
    if (listening) { srRef.current?.stop(); return; }
    const sr = new SR(); srRef.current = sr;
    sr.lang = 'en-US'; sr.continuous = true; sr.interimResults = true;
    baseTextRef.current = text;
    sr.onstart = () => setListening(true);
    sr.onresult = (e: any) => {
      let interim = '', final = baseTextRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += (final ? ' ' : '') + t.trim(); baseTextRef.current = final; }
        else interim = t;
      }
      setText(final + (interim ? ' ' + interim : '')); setInterimText(interim);
    };
    sr.onerror = () => { setListening(false); setInterimText(''); };
    sr.onend = () => { setListening(false); setInterimText(''); setText(baseTextRef.current); };
    sr.start();
  }

  async function submitText(payload: string) {
    if (!payload.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const res = await api.post<CheckinResult>('/checkin', { text: payload });
      setResult(res.data); localStorage.setItem(storageKey, 'done'); onCheckinDone();
      if (res.data.friendly_response) setTimeout(() => speak(res.data.friendly_response, selectedVoice ?? null), 400);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong. Try again.');
    } finally { setLoading(false); }
  }

  async function submit() { if (listening) srRef.current?.stop(); submitText(text); }

  function dismiss() { stopConversation(); setOpen(false); localStorage.setItem(storageKey, 'done'); }

  function reopen() {
    setOpen(true); setResult(null); setText(''); setError('');
    setListening(false); setInterimText(''); setConvoActive(false);
  }

  /* ── Collapsed state ── */
  if (!open) {
    return (
      <button onClick={reopen}
        className="w-full cmd-card px-4 py-3 flex items-center gap-3 tap"
        style={{ textAlign: 'left' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgb(var(--accent-rgb) / 0.12)', border: '1px solid rgb(var(--accent-rgb) / 0.25)' }}>
          <MessageSquare size={13} style={{ color: 'rgb(var(--accent-rgb-light))' }} />
        </div>
        <div>
          <p className="text-xs font-bold" style={{ color: 'rgb(var(--accent-rgb-light))' }}>Daily Intel Report</p>
          <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>Tap to log your check-in for today</p>
        </div>
        <ChevronRight size={14} className="ml-auto" style={{ color: 'var(--t-faint)' }} />
      </button>
    );
  }

  return (
    <div className="cmd-card overflow-hidden">
      {/* Terminal header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-rgb) / 0.15)', border: '1px solid rgb(var(--accent-rgb) / 0.3)' }}>
            <MessageSquare size={13} style={{ color: 'rgb(var(--accent-rgb-light))' }} />
          </div>
          <div>
            <p className="text-xs font-bold text-head">Daily Intel Report</p>
            <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>Log your day — voice or text</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {voices.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowVoicePicker(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium tap"
                style={{ background: 'var(--s3)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                <Volume2 size={10} /><ChevronDown size={9} />
              </button>
              {showVoicePicker && (
                <div className="absolute right-0 top-8 z-50 rounded-xl p-2 shadow-xl"
                  style={{ background: 'var(--s1)', border: '1px solid var(--b)', minWidth: 190, maxHeight: 200, overflowY: 'auto' }}>
                  <p className="sys-label px-2 pb-1.5">Voices</p>
                  {voices.map(v => (
                    <button key={v.name} onClick={() => pickVoice(v)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs tap"
                      style={{ color: v.name === selectedVoiceName ? 'rgb(var(--accent-rgb-light))' : 'var(--t-muted)', background: v.name === selectedVoiceName ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent', fontWeight: v.name === selectedVoiceName ? 600 : 400 }}>
                      {v.name.replace(/\s*\(.*?\)/g, '')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={dismiss} className="tap w-6 h-6 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--t-faint)', background: 'var(--s3)' }}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {result ? (
          /* ── Result ── */
          <div className="space-y-3">
            <div className="rounded-xl px-3 py-3 space-y-2"
              style={{ background: 'rgb(var(--accent-rgb) / 0.06)', border: '1px solid rgb(var(--accent-rgb) / 0.14)' }}>
              <div className="flex items-center justify-between">
                {result.mood ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: MOOD_COLOR[result.mood] + '20' }}>
                      <span className="text-[10px] font-black" style={{ color: MOOD_COLOR[result.mood] }}>{result.mood}</span>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: MOOD_COLOR[result.mood] }}>{MOOD_LABEL[result.mood]}</span>
                  </div>
                ) : <span />}
                {voices.length > 0 && (
                  <button onClick={() => speak(result.friendly_response, selectedVoice ?? null)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] tap"
                    style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                    <Volume2 size={10} /> Replay
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--t-muted)' }}>{result.friendly_response}</p>
            </div>
            {result.skills_upgraded != null && result.skills_upgraded > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
                style={{ background: '#f59e0b12', border: '1px solid #f59e0b25' }}>
                <Zap size={11} style={{ color: '#f59e0b' }} />
                <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                  {result.skills_upgraded} skill{result.skills_upgraded !== 1 ? 's' : ''} levelled up
                </p>
              </div>
            )}
            {result.actions_taken.length > 0 && (() => {
              const groups: Record<string, { color: string; bg: string; icon: any; items: string[] }> = {
                task:    { color: '#22c55e', bg: '#22c55e12', icon: CheckCircle2, items: [] },
                habit:   { color: '#f97316', bg: '#f9731612', icon: Target,       items: [] },
                sleep:   { color: '#818cf8', bg: '#818cf812', icon: Moon,         items: [] },
                journal: { color: '#a855f7', bg: '#a855f712', icon: BookOpen,     items: [] },
                skill:   { color: '#f59e0b', bg: '#f59e0b12', icon: Zap,          items: [] },
                other:   { color: 'var(--t-muted)', bg: 'var(--s2)', icon: Circle, items: [] },
              };
              for (const a of result.actions_taken) {
                if (a.startsWith('✅')) groups.task.items.push(a.replace('✅ ', ''));
                else if (a.startsWith('🔥')) groups.habit.items.push(a.replace('🔥 ', ''));
                else if (a.startsWith('💤')) groups.sleep.items.push(a.replace('💤 ', ''));
                else if (a.startsWith('📓')) groups.journal.items.push(a.replace('📓 ', ''));
                else if (a.startsWith('⚡')) groups.skill.items.push(a.replace('⚡ ', ''));
                else groups.other.items.push(a);
              }
              return (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(groups).map(([key, g]) =>
                    g.items.map((a, i) => {
                      const GIcon = g.icon;
                      return (
                        <span key={`${key}-${i}`}
                          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg"
                          style={{ background: g.bg, color: g.color, border: `1px solid ${g.color}25` }}>
                          <GIcon size={10} /> {a}
                        </span>
                      );
                    })
                  )}
                </div>
              );
            })()}
            <button onClick={reopen} className="text-[11px] tap" style={{ color: 'var(--t-faint)' }}>
              + Log again
            </button>
          </div>

        ) : convoActive ? (
          /* ── Conversation mode ── */
          <div className="space-y-3">
            {/* Progress */}
            <div className="flex items-center gap-1.5">
              {CONVO_QUESTIONS.map((_, i) => (
                <span key={i} className="rounded-full transition-all duration-300"
                  style={{
                    width: i === convoStep ? 20 : 6, height: 6,
                    background: i < convoStep ? 'rgb(var(--accent-rgb) / 0.35)' : i === convoStep ? 'rgb(var(--accent-rgb))' : 'var(--s3)',
                  }} />
              ))}
              <span className="text-[10px] ml-1 font-mono" style={{ color: 'var(--t-faint)' }}>{convoStep + 1}/{CONVO_QUESTIONS.length}</span>
            </div>
            <div className="rounded-xl px-3 py-3"
              style={{ background: 'rgb(var(--accent-rgb) / 0.06)', border: '1px solid rgb(var(--accent-rgb) / 0.16)' }}>
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--accent-rgb-light))' }}>{CONVO_QUESTIONS[convoStep]}</p>
            </div>
            <div className="flex items-center gap-2 min-h-[22px]">
              {speaking ? (
                <>
                  {[0,80,160,100,200,130,60].map((delay, i) => <span key={i} className="waveform-bar" style={{ height: 14, background: 'rgb(var(--accent-rgb-light))', animationDelay: `${delay}ms`, opacity: 0.7 }} />)}
                  <span className="text-[11px] ml-1" style={{ color: 'rgb(var(--accent-rgb-light))' }}>speaking…</span>
                </>
              ) : listening ? (
                <>
                  <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#ef4444' }} />
                  {[0,80,160,100,200,130,60].map((delay, i) => <span key={i} className="waveform-bar" style={{ height: 14, background: '#ef4444', animationDelay: `${delay}ms`, opacity: 0.7 }} />)}
                  <span className="text-[11px] ml-1 truncate" style={{ color: '#ef4444' }}>{interimText || 'listening…'}</span>
                </>
              ) : <span className="text-[11px]" style={{ color: 'var(--t-faint)' }}>processing…</span>}
            </div>
            {text && (
              <div className="rounded-xl px-3 py-2" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
                <p className="text-[11px]" style={{ color: 'var(--t-muted)' }}>{text}</p>
              </div>
            )}
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <div className="flex items-center gap-2">
              <button onClick={stopConversation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium tap"
                style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                <X size={11} /> Stop
              </button>
              {text && (
                <button onClick={() => { stopConversation(); submitText(text); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tap"
                  style={{ background: 'rgb(var(--accent-rgb))', color: '#fff' }}>
                  <Send size={11} /> Log now
                </button>
              )}
            </div>
          </div>

        ) : (
          /* ── Type / dictation mode ── */
          <>
            <p className="text-xs" style={{ color: 'var(--t-faint)' }}>
              {SR ? 'Voice-guided check-in, or just type below.' : 'How was your day?'}
            </p>
            <div className="relative">
              <textarea ref={taRef} rows={3} value={text}
                onChange={e => { setText(e.target.value); baseTextRef.current = e.target.value; }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                placeholder="Slept at 11, woke at 7. Hit the gym, finished the proposal. Feeling solid…"
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                style={{ background: 'var(--s2)', border: `1px solid ${listening ? 'rgb(var(--accent-rgb) / 0.5)' : 'var(--b)'}`, color: 'var(--t-body)', transition: 'border-color 0.2s' }} />
              {listening && interimText && (
                <p className="absolute bottom-2.5 left-3 right-3 text-sm pointer-events-none truncate"
                  style={{ color: 'rgb(var(--accent-rgb-light))', opacity: 0.5 }}>{interimText}…</p>
              )}
            </div>
            {listening && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#ef4444' }} />
                <span className="text-xs" style={{ color: '#ef4444' }}>Listening… speak naturally</span>
              </div>
            )}
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <div className="flex items-center gap-2">
              {SR && (
                <>
                  <button onClick={startConversation}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tap"
                    style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'rgb(var(--accent-rgb-light))', border: '1px solid rgb(var(--accent-rgb) / 0.25)' }}>
                    <Mic size={11} /> Talk to me
                  </button>
                  <div className="relative shrink-0" style={{ width: 30, height: 30 }}>
                    {listening && (<><span className="mic-ring" /><span className="mic-ring mic-ring-2" /><span className="mic-ring mic-ring-3" /></>)}
                    <button onClick={toggleDictation}
                      className={`flex items-center justify-center w-[30px] h-[30px] rounded-xl tap ${listening ? 'mic-listening' : ''}`}
                      style={{ background: listening ? '#ef4444' : 'var(--s2)', color: listening ? '#fff' : 'var(--t-dim)', border: listening ? 'none' : '1px solid var(--b)', position: 'relative', zIndex: 1 }}>
                      {listening ? <MicOff size={11} /> : <MicOff size={11} style={{ opacity: 0.4 }} />}
                    </button>
                  </div>
                </>
              )}
              {listening ? (
                <div className="flex items-end gap-0.5 flex-1" style={{ height: 16 }}>
                  {[0,80,160,100,200,130,60].map((delay, i) => <span key={i} className="waveform-bar" style={{ height: '100%', background: 'rgb(var(--accent-rgb-light))', animationDelay: `${delay}ms`, opacity: 0.8 }} />)}
                </div>
              ) : (
                <span className="text-[10px] flex-1" style={{ color: 'var(--t-faint)' }}>⌘↵ to submit</span>
              )}
              <button onClick={submit} disabled={loading || !text.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 tap"
                style={{ background: 'rgb(var(--accent-rgb))', color: '#fff' }}>
                {loading ? <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" /> : <Send size={11} />}
                {loading ? 'Logging…' : 'Log it'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>('/dashboard');
    setData(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 60000);

  // Local state for optimistic task completion
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());

  function handleComplete(id: number) {
    setCompletedIds(s => new Set([...s, id]));
  }

  if (!data) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--cyan)', borderTopColor: 'transparent' }} />
        <p className="sys-label">Loading command center…</p>
      </div>
    </div>
  );

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const remaining = stats.totalTasks - stats.completedTasks;
  const pct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  // Filter out optimistically completed tasks
  const activeMissions = [...priorityQueue, ...pendingToday]
    .filter((t, idx, self) => self.findIndex(x => x.id === t.id) === idx) // dedupe
    .filter(t => !completedIds.has(t.id))
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4);
    })
    .slice(0, 6);

  const streakData = [
    { label: 'Overall', value: streaks.overall?.current ?? 0, best: streaks.overall?.longest ?? 0, color: '#f97316', icon: Flame },
    { label: 'Tasks',   value: streaks.tasks?.current   ?? 0, best: streaks.tasks?.longest   ?? 0, color: '#6366f1', icon: CheckSquare },
    { label: 'Journal', value: streaks.journal?.current ?? 0, best: streaks.journal?.longest ?? 0, color: '#a855f7', icon: BookOpen },
    { label: 'Workout', value: streaks.workout?.current ?? 0, best: streaks.workout?.longest ?? 0, color: '#ef4444', icon: Dumbbell },
    { label: 'Sleep',   value: streaks.sleep?.current   ?? 0, best: streaks.sleep?.longest   ?? 0, color: '#818cf8', icon: Moon },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 anim-page pb-8"
      style={{ '--accent-rgb': '57 255 20' } as React.CSSProperties}>

      {/* ── WAR ROOM HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-5"
        style={{ background: 'var(--hero-bg)', border: '1px solid #39ff1425', minHeight: 120 }}>
        {/* Tactical grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #39ff1408 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
        {/* Radar arc */}
        <div className="absolute top-3 right-3 pointer-events-none" style={{ width: 70, height: 70 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid #39ff1430',
            boxShadow: '0 0 8px #39ff1420',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 35, height: 1.5,
            background: 'linear-gradient(90deg, #39ff14, transparent)',
            transformOrigin: 'left center',
            animation: 'radar-rotate 3s linear infinite',
            boxShadow: '0 0 6px #39ff14',
          }} />
          <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px solid #39ff1418' }} />
          <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid #39ff1410' }} />
        </div>
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #39ff14', borderLeft: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #39ff14', borderRight: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #39ff14', borderLeft: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #39ff14', borderRight: '1.5px solid #39ff14', opacity: 0.7 }} />
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.35em]" style={{ color: '#39ff14', opacity: 0.6, textShadow: '0 0 8px #39ff14' }}>SYS://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">COMMAND_CENTER</span>
            <span className="cursor-blink font-mono" style={{ color: '#39ff14', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white leading-none"
            style={{ textShadow: '0 0 30px #39ff1440' }}>
            COMMAND CENTER
          </h1>
          <p className="font-mono text-[11px] mt-1" style={{ color: '#39ff14', opacity: 0.5 }}>
            {'// MISSION CONTROL — GOOD '}
            {new Date().getHours() < 12 ? 'MORNING' : new Date().getHours() < 17 ? 'AFTERNOON' : 'EVENING'}
            {', OPERATOR'}
          </p>
          {/* Neon bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #39ff1450, transparent)' }} />
        </div>
      </div>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(57,255,20,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ═══════════════════════════════════════ HEADER */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <p className="sys-label mb-1.5 flex items-center gap-1.5">
              <Swords size={10} style={{ color: 'var(--cyan)', opacity: 0.8 }} />
              {format(new Date(), 'EEEE · d MMMM yyyy').toUpperCase()}
            </p>
            <h1 className="text-2xl font-black text-head tracking-tight">
              Good {getGreeting()}{user?.username ? `, ${user.username}` : ''}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--t-faint)' }}>
              {pct === 100 && stats.totalTasks > 0
                ? <span className="flex items-center gap-1.5"><Award size={12} style={{ color: '#22c55e' }} /><span style={{ color: '#22c55e' }}>All missions cleared</span></span>
                : remaining > 0
                ? `${remaining} active mission${remaining !== 1 ? 's' : ''} pending`
                : 'No missions yet — add something to conquer'}
            </p>
          </div>
          {data.points && data.points.today > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 badge-pop"
              style={{ background: '#f59e0b18', border: '1px solid #f59e0b35' }}>
              <Zap size={11} style={{ color: '#f59e0b' }} />
              <span className="text-xs font-black" style={{ color: '#f59e0b' }}>+{data.points.today} XP</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════ RANK / XP */}
      {data.points && <RankPanel pts={data.points} />}

      {/* ═══════════════════════════════════════ MISSIONS + QUICK ACTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Mission board */}
        <div className="cmd-card overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <SysLabel icon={Target} text={`Active Missions (${activeMissions.length})`} />
            <Link to="/tasks"
              className="flex items-center gap-1 text-[11px] font-bold tap"
              style={{ color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none' }}>
              All <ChevronRight size={11} />
            </Link>
          </div>
          {activeMissions.length === 0 ? (
            <div className="px-4 pb-4 flex flex-col items-center gap-2 py-6">
              <CheckCircle2 size={28} style={{ color: '#22c55e', opacity: 0.5 }} />
              <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>All clear, operative</p>
              <Link to="/tasks"
                className="flex items-center gap-1 text-[11px] font-bold tap px-3 py-1.5 rounded-lg"
                style={{ background: 'rgb(var(--accent-rgb) / 0.1)', color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none', border: '1px solid rgb(var(--accent-rgb) / 0.2)' }}>
                <Plus size={11} /> Add mission
              </Link>
            </div>
          ) : (
            <div className="pb-2">
              {activeMissions.map(t => <MissionCard key={t.id} task={t} onComplete={handleComplete} />)}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <SysLabel icon={Zap} text="Quick Actions" color="#f59e0b" />
          <div className="grid grid-cols-3 gap-2">
            {ACTIONS.map(a => (
              <Link key={a.to} to={a.to} className="action-tile icon-bounce-hover"
                style={{ '--gc': `${a.color}55` } as React.CSSProperties}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bounce-icon"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}>
                  <a.icon size={15} style={{ color: a.color }} />
                </div>
                <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: 'var(--t-muted)' }}>
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ STREAK INTEL */}
      <div>
        <SysLabel icon={TrendingUp} text="// Streak Intel" color="#f97316" />
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scroll">
          {streakData.map((s, i) => (
            <div key={s.label} className="streak-node card-hover glow-card"
              style={{ animationDelay: `${i * 50}ms`, '--gc': `${s.color}55` } as React.CSSProperties}>
              <s.icon size={13} style={{ color: s.color, marginBottom: 4 }} />
              <p className="text-2xl font-black font-mono tabular-nums" style={{ color: s.color, textShadow: `0 0 10px ${s.color}60` }}>
                {s.value}
              </p>
              <p className="text-[9px] font-bold tracking-wider uppercase mt-0.5" style={{ color: 'var(--t-faint)' }}>{s.label}</p>
              <p className="text-[9px]" style={{ color: 'var(--t-faint)', opacity: 0.6 }}>best {s.best}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════ SYSTEM STATUS */}
      {data.snapshot && <SnapshotSection snap={data.snapshot} />}

      {/* ═══════════════════════════════════════ JOURNAL */}
      <div className="cmd-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <SysLabel icon={BookOpen} text="Today's Journal" color="#a855f7" />
          <Link to="/journal"
            className="flex items-center gap-1 text-[11px] font-bold tap"
            style={{ color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none' }}>
            {journal ? 'Edit' : 'Write'} <ChevronRight size={11} />
          </Link>
        </div>
        {journal ? (
          <div className="px-4 pb-4 space-y-2">
            {journal.mood && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: MOOD_COLOR[journal.mood] + '20', border: `1px solid ${MOOD_COLOR[journal.mood]}30` }}>
                  <span className="text-[11px] font-black" style={{ color: MOOD_COLOR[journal.mood] }}>{journal.mood}</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: MOOD_COLOR[journal.mood], background: MOOD_COLOR[journal.mood] + '15' }}>
                  {MOOD_LABEL[journal.mood]}
                </span>
              </div>
            )}
            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--t-muted)' }}>{journal.content}</p>
          </div>
        ) : (
          <Link to="/journal"
            className="mx-4 mb-4 flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold tap"
            style={{ color: 'rgb(var(--accent-rgb-light))', background: 'rgb(var(--accent-rgb) / 0.05)', border: '1px solid rgb(var(--accent-rgb) / 0.12)', textDecoration: 'none' }}>
            <BookOpen size={14} /> Write today's entry
            <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* ═══════════════════════════════════════ DAILY CHECK-IN TERMINAL */}
      <div>
        <SysLabel icon={MessageSquare} text="Intel Report" color="#6366f1" />
        <DailyCheckin onCheckinDone={load} />
      </div>

      {/* ═══════════════════════════════════════ COMPLETION BANNER */}
      {pct === 100 && stats.totalTasks > 0 && (
        <div className="cmd-card px-5 py-4 text-center"
          style={{ borderColor: '#22c55e25', background: 'linear-gradient(135deg, var(--s1) 0%, #052010 100%)' }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Award size={20} style={{ color: '#22c55e' }} />
            <p className="text-sm font-black" style={{ color: '#22c55e' }}>All missions cleared for today</p>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>Outstanding work, operative.</p>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}

    </div>
  );
}
