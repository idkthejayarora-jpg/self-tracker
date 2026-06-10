import { useEffect, useState } from 'react';

// ── Speech synthesis voices ───────────────────────────────────────────────────
// Chrome fires onvoiceschanged several times and returns the list in varying
// order, which made the voice picker jump around. Dedupe by name+lang and sort
// deterministically (best voices first) so the list is stable across reloads.
function voiceRank(v: SpeechSynthesisVoice): number {
  if (/premium/i.test(v.name)) return 0;
  if (/enhanced|neural/i.test(v.name)) return 1;
  if (/siri/i.test(v.name)) return 2;
  if (v.localService) return 3;
  return 4; // network voices (Google/Microsoft online) last — they're the glitchiest
}

export function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const seen = new Set<string>();
      const en = window.speechSynthesis.getVoices()
        .filter(v => v.lang.startsWith('en'))
        .filter(v => {
          const key = `${v.name}|${v.lang}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => voiceRank(a) - voiceRank(b) || a.name.localeCompare(b.name));
      if (en.length) setVoices(prev => {
        // only update when the list actually changed — stops render churn
        if (prev.length === en.length && prev.every((p, i) => p.voiceURI === en[i].voiceURI)) return prev;
        return en;
      });
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
// Groups are re-split at commas/conjunctions past ~170 chars — Chrome's
// network voices silently die on long utterances.
function breathGroups(text: string): string[] {
  const initial = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s+—\s+|…\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const g of initial) {
    if (g.length <= 170) { out.push(g); continue; }
    let rest = g;
    while (rest.length > 170) {
      const slice = rest.slice(0, 170);
      const cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' and '), slice.lastIndexOf(' but '));
      const at = cut > 40 ? cut + 1 : 170;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
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

  // Network voices (Google/Microsoft online) ignore pitch and stutter when
  // rate varies — keep delivery flat for them, drift only on local voices.
  const isLocal = !voice || voice.localService;

  let started = false;
  const speakNext = (i: number) => {
    if (session !== speakSession) return; // superseded by a newer call / stop
    if (i >= groups.length) { onEnd?.(); return; }
    // Chrome wedges in a paused state after cancel() — always unstick first
    window.speechSynthesis.resume();
    const utt = new SpeechSynthesisUtterance(groups[i]);
    utt.lang = 'en-US';
    // gentle drift: questions lift slightly, statements settle
    const isQuestion = /\?$/.test(groups[i]);
    utt.rate   = isLocal ? rate + (Math.random() * 0.06 - 0.03) : rate;
    utt.pitch  = isLocal ? pitch + (isQuestion ? 0.04 : 0) + (Math.random() * 0.04 - 0.02) : 1.0;
    utt.volume = 1.0;
    if (voice) utt.voice = voice;
    if (!started && onStart) { utt.onstart = () => { started = true; onStart(); }; }

    // Chrome occasionally never fires onend (especially network voices) —
    // a watchdog keeps the chain moving so Jay doesn't freeze mid-reply.
    let advanced = false;
    const watchdog = window.setTimeout(() => proceed(), 1000 + groups[i].length * 90);
    const proceed = () => {
      if (advanced) return;
      advanced = true;
      window.clearTimeout(watchdog);
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

  // Chrome swallows an utterance queued in the same tick as cancel() —
  // give the engine a beat to flush before the first group.
  window.setTimeout(() => speakNext(0), 60);
}

export function stopSpeaking() {
  speakSession++; // invalidate any in-flight breath-group chain
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}
