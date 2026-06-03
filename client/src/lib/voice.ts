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

// Pick the most human-sounding available English voice. Premium/"online"
// neural voices (Siri-quality, downloaded in OS settings) are preferred —
// the more the user has installed, the more human AXIS sounds.
export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return (
    // macOS premium / Siri-quality neural voices
    voices.find(v => /(^|\s)(ava|zoe|evan|nathan|joelle|samantha).*(premium|enhanced|neural)/i.test(v.name)) ||
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

export interface SpeakOpts {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  onStart?: () => void;
}

// Speak text with a calm, measured JARVIS-like delivery by default.
export function speak(text: string, opts: SpeakOpts = {}) {
  const { voice = null, rate = 0.96, pitch = 0.92, onEnd, onStart } = opts;
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = rate;
  utt.pitch = pitch;
  utt.volume = 1.0;
  if (voice) utt.voice = voice;
  if (onStart) utt.onstart = onStart;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}
