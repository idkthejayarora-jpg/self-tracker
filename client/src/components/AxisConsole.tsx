import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, ChevronRight, Settings2, Send } from 'lucide-react';
import api from '../lib/api';
import AxisOrb, { type OrbState } from './AxisOrb';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useSpeechVoices, pickBestVoice, speak, stopSpeaking } from '../lib/voice';

const AXIS_COLOR = '#8a7ba8';

interface Concern { id: string; topic: string; question: string; }
interface QA { q: string; a: string; }

// Base interview spine — concerns from the server are interleaved between these.
const BASE_QUESTIONS = [
  "How are you feeling right now — mind and body? Don't filter it.",
  "Walk me through your day. What actually happened?",
  "What did you get done that you're glad about?",
  "Where did you fall short of what you set out to do?",
  "Last thing — is anything weighing on you that we haven't named yet?",
];

// One probing follow-up based on what they just said (the cross-examination).
function probe(answer: string): string | null {
  const a = answer.toLowerCase().trim();
  if (a.length < 12) return "Give me the actual detail, not the headline — what really happened?";
  if (/(tired|exhausted|drained|no energy|burnt|burned out|sleepy)/.test(a)) return "That tiredness — is it your body or your head? Be specific.";
  if (/(stress|anxious|overwhelm|pressure|worried|nervous)/.test(a)) return "What's the single biggest source of that pressure right now?";
  if (/(didn'?t|couldn'?t|skipped|failed|missed|lazy|procrastinat|avoid|put off)/.test(a)) return "No judgment — what actually got in the way?";
  if (/(great|good|amazing|crushed|productive|proud|win|won|nailed|focused|clear)/.test(a)) return "I like that. What made the difference today, so we can repeat it?";
  if (/(angry|frustrat|annoyed|pissed|upset|hurt)/.test(a)) return "Where's that coming from? Name the real trigger.";
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
    }

    // Cross-question: maybe inject ONE probing follow-up before moving on.
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
    setPreview(q);
    setOrb('speaking');
    speak(q, {
      voice: voiceObjRef.current,
      onEnd: () => {
        // After AXIS speaks, listen for the answer
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
    setTimeout(askCurrent, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askCurrent]);

  async function finish() {
    setOrb('thinking');
    setPreview('Reflecting on everything you told me…');
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
    setOrb('thinking');
    setPreview('Connecting…');
    try {
      const { data } = await api.get<{ greeting: string; concerns: Concern[] }>('/life/axis/brief');
      // Build the queue: greeting is spoken as the first "question" (no answer
      // expected — but we still listen; a no-op answer just advances).
      const concerns = data.concerns.map(c => c.question);
      const q: string[] = [];
      q.push(data.greeting + ' First — ' + BASE_QUESTIONS[0]);
      if (concerns[0]) q.push(concerns[0]);
      q.push(BASE_QUESTIONS[1]);
      if (concerns[1]) q.push(concerns[1]);
      q.push(BASE_QUESTIONS[2]);
      if (concerns[2]) q.push(concerns[2]);
      q.push(BASE_QUESTIONS[3]);
      q.push(BASE_QUESTIONS[4]);
      queueRef.current = q;
      idxRef.current = 0;
      askCurrent();
    } catch {
      // Fallback: run the base spine without server concerns
      queueRef.current = BASE_QUESTIONS.slice();
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
    orb === 'speaking'  ? 'AXIS is speaking'
    : orb === 'listening' ? 'Listening…'
    : orb === 'thinking'  ? 'Thinking…'
    : phase === 'done'    ? 'Debrief complete'
    : 'Tap to begin your debrief';

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden flex-1 min-w-0"
      style={{ background: 'var(--s1)', border: '1px solid var(--b)', minHeight: 520 }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
        <span className="text-sm font-black tracking-widest" style={{ color: AXIS_COLOR }}>AXIS</span>
        <span className="cursor-blink font-mono text-xs" style={{ color: AXIS_COLOR }}>▌</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--t-faint)' }}>voice debrief</span>
        <button onClick={() => setShowVoices(s => !s)} className="tap" style={{ color: 'var(--t-faint)' }} title="Voice">
          <Settings2 size={14} />
        </button>
      </div>

      {/* Voice picker */}
      {showVoices && (
        <div className="px-4 py-3 space-y-1.5 max-h-40 overflow-y-auto" style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
          <p className="text-[10px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>AXIS VOICE</p>
          {voices.length === 0 && <p className="text-xs" style={{ color: 'var(--t-faint)' }}>No system voices found.</p>}
          {voices.map(v => (
            <button key={v.name}
              onClick={() => { setVoiceName(v.name); localStorage.setItem('axis_voice_name', v.name); speak('This is the voice I’ll use.', { voice: v }); setShowVoices(false); }}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg tap"
              style={{ background: voiceName === v.name ? `${AXIS_COLOR}1a` : 'var(--s3)', color: voiceName === v.name ? AXIS_COLOR : 'var(--t-muted)' }}>
              {v.name} <span style={{ opacity: 0.5 }}>· {v.lang}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Orb stage ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-5">
        <AxisOrb state={orb} color={AXIS_COLOR} size={230}
          onTap={phase === 'idle' || phase === 'done' ? begin : undefined} />

        {/* Small text preview under the orb */}
        <div className="text-center min-h-[3.5rem] max-w-md flex flex-col items-center gap-1.5">
          <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: AXIS_COLOR, opacity: 0.7 }}>
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
              style={{ background: 'rgb(239 68 68 / 0.12)', color: '#e07b62' }}>
              <Square size={12} /> End
            </button>
          </div>
        ) : (
          <button onClick={begin}
            className="tap flex items-center gap-2 text-sm font-black px-6 py-3 rounded-2xl"
            style={{ background: AXIS_COLOR, color: '#fff', boxShadow: `0 0 24px ${AXIS_COLOR}55` }}>
            <Mic size={16} /> {phase === 'done' ? 'Run another debrief' : 'Begin debrief'}
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
              style={{ background: AXIS_COLOR }}>
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
              <p className="text-[11px] font-mono leading-snug" style={{ color: AXIS_COLOR, opacity: 0.8 }}>
                <span className="font-black">AXIS //</span> {qa.q}
              </p>
              <p className="text-xs leading-snug pl-3" style={{ color: 'var(--t-muted)', borderLeft: `2px solid ${AXIS_COLOR}30` }}>
                {qa.a}
              </p>
            </div>
          ))}
          {reflection && phase === 'done' && (
            <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: `${AXIS_COLOR}10`, border: `1px solid ${AXIS_COLOR}30` }}>
              <p className="text-[10px] font-black tracking-widest mb-1" style={{ color: AXIS_COLOR }}>AXIS · REFLECTION</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--t-body)' }}>{reflection}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
