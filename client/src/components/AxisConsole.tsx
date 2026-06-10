import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, ChevronRight, Settings2, Send } from 'lucide-react';
import api from '../lib/api';
import AxisOrb, { type OrbState } from './AxisOrb';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useSpeechVoices, pickBestVoice, speak, stopSpeaking } from '../lib/voice';

const JAY_COLOR = '#e59a7f';

interface Concern { id: string; topic: string; question: string; }
interface QA { q: string; a: string; }

// Base interview spine — each slot has a few phrasings so the conversation
// never repeats itself word-for-word two nights in a row.
const BASE_QUESTIONS: string[][] = [
  [
    "How are you, actually? Not the polite version.",
    "First off — how are you feeling right now? For real.",
    "Before anything else — how are you doing? Honestly.",
  ],
  [
    "Walk me through your day. Just talk, I'm listening.",
    "So what did your day actually look like?",
    "Tell me about today. Start anywhere.",
  ],
  [
    "What's one thing you're glad you got done today?",
    "Tell me something that went right today.",
    "What did you do today that you'd do again?",
  ],
  [
    "And where did you slip? No judgment — just say it.",
    "What didn't get done that you wanted to?",
    "Where did today get away from you?",
  ],
  [
    "Anything else sitting on your chest before we wrap up?",
    "Last one — anything we haven't said out loud yet?",
    "Before we close the day — anything else you want off your mind?",
  ],
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── Human reactions ───────────────────────────────────────────────────────────
// A short, spoken acknowledgment of what was just said — like a friend nodding
// before they ask the next thing. Never the same line twice in a row.
let lastAck = '';
function reactTo(answer: string): string {
  const a = answer.toLowerCase().trim();
  let pool: string[];
  if (/(tired|exhausted|drained|no energy|burnt|burned out|sleepy)/.test(a)) {
    pool = ["Yeah… I can hear it in you.", "Okay. Long one, then.", "That kind of tired sits deep."];
  } else if (/(stress|anxious|overwhelm|pressure|worried|nervous)/.test(a)) {
    pool = ["That's a lot to carry.", "Okay. I hear you.", "Yeah… that'll sit on you."];
  } else if (/(didn'?t|couldn'?t|skipped|failed|missed|lazy|procrastinat|avoid|put off)/.test(a)) {
    pool = ["Happens. Nobody's keeping score here.", "Alright. At least you said it straight.", "Okay — honest answer, I'll take it."];
  } else if (/(great|good|amazing|crushed|productive|proud|win|won|nailed|focused|clear)/.test(a)) {
    pool = ["Hey — that's good. Genuinely.", "Nice. I like hearing that.", "Good. Hold onto that one."];
  } else if (/(angry|frustrat|annoyed|pissed|upset|hurt)/.test(a)) {
    pool = ["Fair enough. Let it out.", "Yeah… I get it.", "Okay. That's real."];
  } else if (a.length < 15) {
    pool = ["Mm.", "Okay.", "Right."];
  } else {
    pool = ["Okay.", "Got it.", "Mm-hm.", "Makes sense.", "Alright."];
  }
  let ack = pick(pool);
  if (ack === lastAck && pool.length > 1) ack = pick(pool.filter(p => p !== ack));
  lastAck = ack;
  return ack;
}

// Natural bridges into the next question — sometimes none at all, the way a
// real person just lets the next thought arrive.
function bridge(): string {
  return pick(["So — ", "Alright — ", "Okay… ", "Next thing. ", "Tell me this — ", "", "", ""]);
}

// One probing follow-up based on what they just said.
function probe(answer: string): string | null {
  const a = answer.toLowerCase().trim();
  if (a.length < 12) return pick([
    "C'mon — give me a little more than that. What actually happened?",
    "That's the headline. What's the story?",
  ]);
  if (/(tired|exhausted|drained|no energy|burnt|burned out|sleepy)/.test(a)) return pick([
    "Is that body-tired, or head-tired?",
    "Where's the tiredness coming from — sleep, or everything else?",
  ]);
  if (/(stress|anxious|overwhelm|pressure|worried|nervous)/.test(a)) return pick([
    "What's the biggest thing pressing on you right now?",
    "If you could take one thing off the pile tonight, what would it be?",
  ]);
  if (/(didn'?t|couldn'?t|skipped|failed|missed|lazy|procrastinat|avoid|put off)/.test(a)) return pick([
    "What actually got in the way? For real.",
    "Was it the task, or was it the day around it?",
  ]);
  if (/(great|good|amazing|crushed|productive|proud|win|won|nailed|focused|clear)/.test(a)) return pick([
    "What made today click? So we can do it again.",
    "What was different about today? I want to bottle it.",
  ]);
  if (/(angry|frustrat|annoyed|pissed|upset|hurt)/.test(a)) return pick([
    "What set it off? Name it.",
    "Who or what is that actually about?",
  ]);
  return null;
}

type Phase = 'idle' | 'running' | 'done';

export default function AxisConsole({ onFinished }: { onFinished?: (sectors: unknown[]) => void }) {
  const voices = useSpeechVoices();
  const [voiceName, setVoiceName] = useState<string>(() => localStorage.getItem('axis_voice_name') ?? '');
  const [showVoices, setShowVoices] = useState(false);
  const selectedVoice = voices.find(v => v.name === voiceName) ?? pickBestVoice(voices);
  // Always read the latest picked voice from a ref so the memoized speak loop
  // never uses a stale (or null-before-load) voice on later questions.
  const voiceObjRef = useRef<SpeechSynthesisVoice | null>(selectedVoice);
  voiceObjRef.current = selectedVoice;

  const [phase, setPhase]       = useState<Phase>('idle');
  const [orb, setOrb]           = useState<OrbState>('idle');
  const [preview, setPreview]   = useState('');           // small text under the orb
  const [transcript, setTranscript] = useState<QA[]>([]);
  const [reflection, setReflection] = useState('');
  const [typed, setTyped]       = useState('');

  // Interview queue + cursor live in refs so the async loop reads fresh values.
  const queueRef    = useRef<string[]>([]);
  const idxRef      = useRef(0);
  const qaRef       = useRef<QA[]>([]);
  const probedRef   = useRef(false);   // one follow-up per question
  const ackRef      = useRef('');      // spoken before the next question

  // default voice once loaded
  useEffect(() => {
    if (voices.length && !voiceName) {
      const b = pickBestVoice(voices);
      if (b) { setVoiceName(b.name); localStorage.setItem('axis_voice_name', b.name); }
    }
  }, [voices, voiceName]);

  // ── Answer handling (shared by voice + typed) ──────────────────────────────
  const handleAnswer = useCallback((answer: string) => {
    const clean = answer.trim();
    const currentQ = queueRef.current[idxRef.current] || '';
    if (clean) {
      qaRef.current = [...qaRef.current, { q: currentQ, a: clean }];
      setTranscript([...qaRef.current]);
      // React like a person — this gets spoken before whatever comes next.
      ackRef.current = reactTo(clean);
    }

    // Maybe inject ONE probing follow-up before moving on.
    if (clean && !probedRef.current) {
      const p = probe(clean);
      if (p) {
        probedRef.current = true;
        queueRef.current.splice(idxRef.current + 1, 0, p);
      }
    }
    advance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voice = useVoiceInput({
    onFinal: (t) => { setPreview(t); handleAnswer(t); },
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // Update the live preview with interim speech while listening
  useEffect(() => {
    if (orb === 'listening' && voice.interim) setPreview(voice.interim);
  }, [voice.interim, orb]);

  // ── The conversation engine ────────────────────────────────────────────────
  const askCurrent = useCallback(() => {
    const q = queueRef.current[idxRef.current];
    if (!q) { finish(); return; }
    probedRef.current = false;
    // Acknowledge what they said, breathe, then ask — one natural utterance.
    const ack = ackRef.current;
    ackRef.current = '';
    const spoken = ack ? `${ack} ${bridge()}${q}` : q;
    setPreview(q);
    setOrb('speaking');
    speak(spoken, {
      voice: voiceObjRef.current,
      onEnd: () => {
        // After Jay speaks, listen for the answer
        if (voiceRef.current.supported) {
          setOrb('listening');
          setPreview('');
          voiceRef.current.start();
        } else {
          setOrb('idle'); // typed fallback
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVoice]);

  const advance = useCallback(() => {
    idxRef.current += 1;
    if (idxRef.current >= queueRef.current.length) { finish(); return; }
    setOrb('thinking');
    // a beat of thought before responding, like a person would take
    setTimeout(askCurrent, 700 + Math.random() * 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askCurrent]);

  async function finish() {
    setOrb('thinking');
    setPreview('Give me a second — thinking about everything you said…');
    try {
      const { data } = await api.post<{ reflection: string; sectors: unknown[] }>(
        '/life/axis/finish', { transcript: qaRef.current }
      );
      setReflection(data.reflection);
      setPhase('done');
      setOrb('speaking');
      setPreview(data.reflection);
      speak(data.reflection, { voice: voiceObjRef.current, onEnd: () => setOrb('idle') });
      onFinished?.(data.sectors);
    } catch {
      setPhase('done'); setOrb('idle'); setPreview('');
    }
  }

  async function begin() {
    setPhase('running');
    setReflection('');
    qaRef.current = [];
    setTranscript([]);
    idxRef.current = 0;
    ackRef.current = '';
    setOrb('thinking');
    setPreview('One sec…');
    try {
      const { data } = await api.get<{ greeting: string; concerns: Concern[] }>('/life/axis/brief');
      // Build the queue: greeting flows straight into the first question.
      const concerns = data.concerns.map(c => c.question);
      const spine = BASE_QUESTIONS.map(pick);
      const q: string[] = [];
      q.push(data.greeting + ' ' + spine[0]);
      if (concerns[0]) q.push(concerns[0]);
      q.push(spine[1]);
      if (concerns[1]) q.push(concerns[1]);
      q.push(spine[2]);
      if (concerns[2]) q.push(concerns[2]);
      q.push(spine[3]);
      q.push(spine[4]);
      queueRef.current = q;
      idxRef.current = 0;
      askCurrent();
    } catch {
      // Fallback: run the base spine without server concerns
      queueRef.current = BASE_QUESTIONS.map(pick);
      idxRef.current = 0;
      askCurrent();
    }
  }

  function stopAll() {
    stopSpeaking();
    voiceRef.current.stop();
    finish();
  }

  function skip() {
    stopSpeaking();
    voiceRef.current.stop();
    advance();
  }

  function submitTyped() {
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    handleAnswer(t);
  }

  // Cleanup
  useEffect(() => () => { stopSpeaking(); }, []);

  const statusLabel =
    orb === 'speaking'  ? 'Jay is talking'
    : orb === 'listening' ? "Your turn — he's listening"
    : orb === 'thinking'  ? 'Thinking…'
    : phase === 'done'    ? 'Done for today'
    : 'Tap to talk it out';

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden flex-1 min-w-0"
      style={{ background: 'var(--s1)', border: '1px solid var(--b)', minHeight: 520 }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
        <span className="text-sm font-black tracking-widest" style={{ color: JAY_COLOR }}>JAY</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--t-faint)' }}>evening debrief</span>
        <button onClick={() => setShowVoices(s => !s)} className="tap" style={{ color: 'var(--t-faint)' }} title="Voice">
          <Settings2 size={14} />
        </button>
      </div>

      {/* Voice picker */}
      {showVoices && (
        <div className="px-4 py-3 space-y-1.5 max-h-44 overflow-y-auto" style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
          <p className="text-[10px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>JAY'S VOICE</p>
          <p className="text-[10px] leading-relaxed mb-2" style={{ color: 'var(--t-faint)' }}>
            Tip: install a Premium voice in System Settings → Accessibility → Spoken Content → Manage Voices, and Jay picks it up automatically.
          </p>
          {voices.length === 0 && <p className="text-xs" style={{ color: 'var(--t-faint)' }}>No system voices found.</p>}
          {voices.map(v => (
            <button key={v.name}
              onClick={() => { setVoiceName(v.name); localStorage.setItem('axis_voice_name', v.name); speak("Alright — this is how I'll sound.", { voice: v }); setShowVoices(false); }}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg tap"
              style={{ background: voiceName === v.name ? `${JAY_COLOR}1a` : 'var(--s3)', color: voiceName === v.name ? JAY_COLOR : 'var(--t-muted)' }}>
              {v.name} <span style={{ opacity: 0.5 }}>· {v.lang}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Orb stage ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-5">
        <AxisOrb state={orb} color={JAY_COLOR} size={230}
          onTap={phase === 'idle' || phase === 'done' ? begin : undefined} />

        {/* Small text preview under the orb */}
        <div className="text-center min-h-[3.5rem] max-w-md flex flex-col items-center gap-1.5">
          <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: JAY_COLOR, opacity: 0.7 }}>
            {statusLabel}
          </p>
          {preview && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--t-body)' }}>
              {preview}
            </p>
          )}
        </div>

        {/* Controls */}
        {phase === 'running' ? (
          <div className="flex items-center gap-2">
            <button onClick={skip}
              className="tap flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
              style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
              Skip <ChevronRight size={13} />
            </button>
            <button onClick={stopAll}
              className="tap flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl"
              style={{ background: 'rgb(179 55 46 / 0.12)', color: '#e07b62' }}>
              <Square size={12} /> End
            </button>
          </div>
        ) : (
          <button onClick={begin}
            className="tap flex items-center gap-2 text-sm font-black px-6 py-3 rounded-2xl"
            style={{ background: JAY_COLOR, color: '#fff', boxShadow: 'none' }}>
            <Mic size={16} /> {phase === 'done' ? 'Talk again' : 'Start the debrief'}
          </button>
        )}

        {/* Typed fallback for the current question (also works without a mic) */}
        {phase === 'running' && orb !== 'speaking' && orb !== 'thinking' && (
          <div className="flex items-end gap-2 w-full max-w-md">
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitTyped(); }}
              placeholder="…or type your answer"
              className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }}
            />
            <button onClick={submitTyped} disabled={!typed.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center tap disabled:opacity-30 text-white shrink-0"
              style={{ background: JAY_COLOR }}>
              <Send size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Session transcript */}
      {transcript.length > 0 && (
        <div className="px-4 py-3 space-y-2.5 max-h-48 overflow-y-auto" style={{ borderTop: '1px solid var(--b)' }}>
          {transcript.map((qa, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[11px] leading-snug" style={{ color: JAY_COLOR, opacity: 0.85 }}>
                <span className="font-black">Jay —</span> {qa.q}
              </p>
              <p className="text-xs leading-snug pl-3" style={{ color: 'var(--t-muted)', borderLeft: `2px solid ${JAY_COLOR}30` }}>
                {qa.a}
              </p>
            </div>
          ))}
          {reflection && phase === 'done' && (
            <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: `${JAY_COLOR}10`, border: `1px solid ${JAY_COLOR}30` }}>
              <p className="text-[10px] font-black tracking-widest mb-1" style={{ color: JAY_COLOR }}>JAY · CLOSING THOUGHT</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--t-body)' }}>{reflection}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
