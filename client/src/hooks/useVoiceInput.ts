import { useEffect, useRef, useState, useCallback } from 'react';

// Web Speech API — no external service, runs in the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  null;

interface UseVoiceInput {
  supported: boolean;
  listening: boolean;
  interim: string;       // live (not-yet-final) words while speaking
  start: () => void;
  stop: () => void;
}

/**
 * Continuous English speech-to-text with auto-stop after a silence gap.
 * Calls `onFinal(fullTranscript)` once when recognition ends with content.
 */
export function useVoiceInput(opts: {
  onFinal: (text: string) => void;
  silenceMs?: number;
  lang?: string;
}): UseVoiceInput {
  const { onFinal, silenceMs = 1800, lang = 'en-US' } = opts;
  const [listening, setListening] = useState(false);
  const [interim, setInterim]     = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef        = useRef<any>(null);
  const silenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef     = useRef('');
  const onFinalRef   = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    try { srRef.current?.stop(); } catch (_) { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    if (!SR) return;
    // Tear down any prior instance
    try { srRef.current?.abort?.(); } catch (_) { /* noop */ }

    const sr = new SR();
    srRef.current = sr;
    finalRef.current = '';
    sr.lang = lang;
    sr.continuous = true;
    sr.interimResults = true;

    sr.onstart = () => { setListening(true); setInterim(''); };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalRef.current += (finalRef.current ? ' ' : '') + t.trim();
        } else {
          live = t;
        }
      }
      setInterim(live);
      // Auto-stop after a gap of silence once we have something
      if (silenceRef.current) clearTimeout(silenceRef.current);
      if (finalRef.current || live) {
        silenceRef.current = setTimeout(() => { try { sr.stop(); } catch (_) { /* noop */ } }, silenceMs);
      }
    };

    sr.onerror = () => { setListening(false); setInterim(''); };

    sr.onend = () => {
      setListening(false);
      setInterim('');
      if (silenceRef.current) clearTimeout(silenceRef.current);
      const text = finalRef.current.trim();
      if (text) onFinalRef.current(text);
    };

    try { sr.start(); } catch (_) { /* start can throw if already running */ }
  }, [lang, silenceMs]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    try { srRef.current?.abort?.(); } catch (_) { /* noop */ }
  }, []);

  return { supported: !!SR, listening, interim, start, stop };
}
