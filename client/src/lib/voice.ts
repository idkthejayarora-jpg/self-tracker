import { useEffect, useState } from 'react';

// ── Speech synthesis voices ───────────────────────────────────────────────────
export function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const en = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      if (en.length) setVoices(en);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

// Pick the most human-sounding available English voice. Premium/Enhanced
// neural voices (Siri-quality, downloaded in OS settings) come first — if the
// user installs one (System Settings → Accessibility → Spoken Content →
// System Voice → Manage Voices), Jay automatically sounds like a person.
export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return (
    // Any premium/enhanced neural voice, best first
    voices.find(v => /premium/i.test(v.name)) ||
    voices.find(v => /enhanced/i.test(v.name) && /(ava|zoe|evan|nathan|joelle|samantha|tom|allison|susan)/i.test(v.name)) ||
    voices.find(v => /enhanced|neural/i.test(v.name)) ||
    voices.find(v => /siri/i.test(v.name)) ||
    // Microsoft online neural
    voices.find(v => /microsoft.*(aria|jenny|guy|davis|jason|tony|sonia|ryan).*online/i.test(v.name)) ||
    // Google
    voices.find(v => /google (uk english male|us english)/i.test(v.name)) ||
    voices.find(v => /google.*english/i.test(v.name)) ||
    // Solid macOS built-ins
    voices.find(v => /(ava|samantha|tom|alex|daniel|serena|karen|tessa|moira)/i.test(v.name)) ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.lang === 'en-US') ||
    voices[0]
  );
}

// Jay speaks with a male-leaning natural voice when one exists; otherwise the
// best available voice. Premium/Enhanced voices (downloadable in macOS/iOS
// settings) always win.
export function pickJayVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return (
    voices.find(v => /premium/i.test(v.name) && /(evan|nathan|tom|oliver|aaron|daniel)/i.test(v.name)) ||
    voices.find(v => /enhanced/i.test(v.name) && /(evan|nathan|tom|oliver|aaron|daniel|alex)/i.test(v.name)) ||
    voices.find(v => /premium/i.test(v.name)) ||
    voices.find(v => /enhanced|neural/i.test(v.name)) ||
    voices.find(v => /siri.*(male|voice 1|aaron)/i.test(v.name)) ||
    voices.find(v => /microsoft.*(guy|davis|jason|ryan|tony).*online/i.test(v.name)) ||
    voices.find(v => /google uk english male/i.test(v.name)) ||
    voices.find(v => /\b(alex|daniel|tom|aaron|fred)\b/i.test(v.name)) ||
    pickBestVoice(voices)
  );
}

// Strip anything that isn't spoken language — markdown, emoji, list bullets —
// so TTS never reads "asterisk asterisk" or chokes on symbols.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_`#~]/g, '')
    .replace(/^[-•]\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SpeakOpts {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  onStart?: () => void;
}

// Split text into natural breath groups: sentences, plus long-pause breaks
// at em dashes and ellipses, the way a person actually phrases things.
function breathGroups(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s+—\s+|…\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

let speakSession = 0;

// Human delivery: speak in breath groups with real pauses between them, at a
// natural conversational rate with a tiny per-phrase drift so it never drones
// at one frozen pitch the way default TTS does.
export function speak(text: string, opts: SpeakOpts = {}) {
  const { voice = null, rate = 1.0, pitch = 1.0, onEnd, onStart } = opts;
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const session = ++speakSession;
  const groups = breathGroups(cleanForSpeech(text));
  if (!groups.length) { onEnd?.(); return; }

  let started = false;
  const speakNext = (i: number) => {
    if (session !== speakSession) return; // superseded by a newer call / stop
    if (i >= groups.length) { onEnd?.(); return; }
    const utt = new SpeechSynthesisUtterance(groups[i]);
    utt.lang = 'en-US';
    // gentle drift: questions lift slightly, statements settle
    const isQuestion = /\?$/.test(groups[i]);
    utt.rate   = rate  + (Math.random() * 0.06 - 0.03);
    utt.pitch  = pitch + (isQuestion ? 0.04 : 0) + (Math.random() * 0.04 - 0.02);
    utt.volume = 1.0;
    if (voice) utt.voice = voice;
    if (!started && onStart) { utt.onstart = () => { started = true; onStart(); }; }
    const proceed = () => {
      if (session !== speakSession) return;
      // breath pause: longer after a full stop, brief after a dash break
      const punct = /[.!?]$/.test(groups[i]) ? 320 : 160;
      const jitter = Math.random() * 120;
      window.setTimeout(() => speakNext(i + 1), punct + jitter);
    };
    utt.onend = proceed;
    utt.onerror = proceed;
    window.speechSynthesis.speak(utt);
  };
  speakNext(0);
}

export function stopSpeaking() {
  speakSession++; // invalidate any in-flight breath-group chain
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}
