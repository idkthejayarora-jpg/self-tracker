import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, X, Quote } from 'lucide-react';
import api from '../lib/api';

interface QuoteItem {
  id: number;
  text: string;
  author: string | null;
  created_at: string;
}

/* ── Ambient orb colours — cycling warm palette ───────────────────────── */
const ORB_PALETTES = [
  { a: '#e08b4e', b: '#c2553d', c: '#d9a066' },
  { a: '#d97757', b: '#b3372e', c: '#e8a87c' },
  { a: '#cf8a3e', b: '#d4a27f', c: '#c2553d' },
  { a: '#b5764f', b: '#d9a066', c: '#d97757' },
];

/* ── One big flashy life-mimicking quote tile ─────────────────────────── */
function QuoteTile({
  quote, total, index, onPrev, onNext,
}: {
  quote: QuoteItem; total: number; index: number;
  onPrev: () => void; onNext: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [orb, setOrb] = useState(0);
  const prevId = useRef(quote.id);

  // Crossfade when quote changes
  useEffect(() => {
    if (quote.id === prevId.current) return;
    prevId.current = quote.id;
    setVisible(false);
    const t = setTimeout(() => { setVisible(true); setOrb(o => (o + 1) % ORB_PALETTES.length); }, 280);
    return () => clearTimeout(t);
  }, [quote.id]);

  // Auto-advance every 9 s
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(onNext, 9000);
    return () => clearInterval(t);
  }, [total, onNext]);

  const pal = ORB_PALETTES[orb];

  return (
    <div className="relative overflow-hidden rounded-3xl"
      style={{
        minHeight: 340,
        background: 'var(--s1)',
        border: '1.5px solid var(--bh)',
        boxShadow: `0 32px 80px ${pal.a}22, 0 0 0 1px ${pal.a}18`,
      }}>

      {/* SVG grain texture */}
      <svg width="0" height="0" className="absolute">
        <filter id="qtile-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </svg>
      <div className="absolute inset-0 pointer-events-none"
        style={{ filter: 'url(#qtile-grain)', opacity: 0.035, zIndex: 0, borderRadius: 'inherit' }} />

      {/* Ambient orb A */}
      <div className="absolute pointer-events-none"
        style={{
          width: 380, height: 380, borderRadius: '50%',
          background: `radial-gradient(circle, ${pal.a}28 0%, transparent 70%)`,
          top: -120, left: -80,
          transition: 'background 1.4s ease',
          zIndex: 0,
          animation: 'orb-drift-a 18s ease-in-out infinite',
        }} />

      {/* Ambient orb B */}
      <div className="absolute pointer-events-none"
        style={{
          width: 300, height: 300, borderRadius: '50%',
          background: `radial-gradient(circle, ${pal.b}1e 0%, transparent 70%)`,
          bottom: -80, right: -60,
          transition: 'background 1.4s ease',
          zIndex: 0,
          animation: 'orb-drift-b 22s ease-in-out infinite',
        }} />

      {/* Torn-paper top edge */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ zIndex: 1 }}>
        <svg viewBox="0 0 400 16" preserveAspectRatio="none" style={{ width: '100%', height: 16, display: 'block' }}>
          <path d="M0,0 L0,10 Q20,14 40,9 Q60,4 80,12 Q100,16 120,10 Q140,4 160,13 Q180,16 200,9 Q220,3 240,12 Q260,16 280,9 Q300,3 320,13 Q340,16 360,10 Q380,5 400,12 L400,0 Z"
            fill="var(--s1)" />
        </svg>
      </div>

      {/* Torn-paper bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ zIndex: 1 }}>
        <svg viewBox="0 0 400 16" preserveAspectRatio="none" style={{ width: '100%', height: 16, display: 'block', transform: 'rotate(180deg)' }}>
          <path d="M0,0 L0,10 Q20,14 40,9 Q60,4 80,12 Q100,16 120,10 Q140,4 160,13 Q180,16 200,9 Q220,3 240,12 Q260,16 280,9 Q300,3 320,13 Q340,16 360,10 Q380,5 400,12 L400,0 Z"
            fill="var(--s1)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center text-center px-8 md:px-16 py-14"
        style={{ zIndex: 2, minHeight: 340 }}>

        {/* Big decorative quote mark */}
        <div className="absolute top-6 left-7 opacity-10 pointer-events-none select-none"
          style={{ fontSize: 100, lineHeight: 1, fontFamily: "'Lora', Georgia, serif", color: pal.a }}>
          ❝
        </div>

        {/* Quote text — crossfades */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
        }}>
          <p style={{
            fontFamily: "'Lora', Georgia, serif",
            fontSize: 'clamp(1.25rem, 3vw, 2rem)',
            fontWeight: 700,
            lineHeight: 1.45,
            color: 'var(--t-head)',
            letterSpacing: '-0.01em',
            textShadow: `0 0 60px ${pal.a}30`,
            maxWidth: 640,
            margin: '0 auto',
          }}>
            {quote.text}
          </p>

          {quote.author && (
            <p className="mt-5 text-sm font-bold tracking-[0.14em] uppercase"
              style={{ color: pal.a, opacity: 0.8 }}>
              — {quote.author}
            </p>
          )}
        </div>

        {/* Nav controls */}
        {total > 1 && (
          <div className="flex items-center gap-3 mt-8">
            <button onClick={onPrev}
              className="tap w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ background: `${pal.a}18`, border: `1px solid ${pal.a}30`, color: pal.a }}>
              <ChevronLeft size={16} />
            </button>

            {/* Dot indicators */}
            <div className="flex gap-1.5">
              {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
                <div key={i} className="rounded-full transition-all duration-300"
                  style={{
                    width: i === index % 8 ? 18 : 6,
                    height: 6,
                    background: i === index % 8 ? pal.a : `${pal.a}30`,
                  }} />
              ))}
              {total > 8 && (
                <span className="text-[9px] font-bold self-center ml-1" style={{ color: pal.a, opacity: 0.6 }}>
                  {index + 1}/{total}
                </span>
              )}
            </div>

            <button onClick={onNext}
              className="tap w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ background: `${pal.a}18`, border: `1px solid ${pal.a}30`, color: pal.a }}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add Quote Modal ──────────────────────────────────────────────────── */
function AddQuoteModal({ onClose, onSaved }: { onClose: () => void; onSaved: (q: QuoteItem) => void }) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const r = await api.post('/quotes', { text, author });
      onSaved(r.data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scale-in w-full max-w-lg rounded-3xl overflow-hidden"
        style={{
          background: 'var(--s2)',
          border: '1.5px solid var(--bh)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
        }}>

        {/* Torn top */}
        <div style={{ background: 'var(--s1)', height: 14, position: 'relative' }}>
          <svg viewBox="0 0 400 14" preserveAspectRatio="none" style={{ width: '100%', height: 14, display: 'block', position: 'absolute', bottom: 0 }}>
            <path d="M0,0 L0,8 Q25,14 50,8 Q75,2 100,10 Q125,14 150,8 Q175,2 200,11 Q225,14 250,8 Q275,2 300,11 Q325,14 350,8 Q375,2 400,10 L400,0 Z"
              fill="var(--s2)" />
          </svg>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 pt-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Quote size={16} style={{ color: '#d97757' }} />
              <h2 className="font-black text-head text-base" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                Add a quote
              </h2>
            </div>
            <button type="button" onClick={onClose}
              className="tap w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ color: 'var(--t-faint)', background: 'var(--s3)', border: '1px solid var(--b)' }}>
              <X size={13} />
            </button>
          </div>

          <textarea
            autoFocus
            placeholder="Type or paste a quote that moves you…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="w-full rounded-2xl px-4 py-3 resize-none text-base"
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: 15,
              lineHeight: 1.6,
              background: 'var(--s1)',
              border: '1.5px solid var(--b)',
              color: 'var(--t-head)',
            }}
            required
          />

          <input
            placeholder="Author (optional)"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }}
          />

          <button type="submit" disabled={saving || !text.trim()}
            className="w-full py-3.5 rounded-2xl text-sm font-black tracking-wider disabled:opacity-40 tap"
            style={{ background: '#d97757', color: '#1a1714' }}>
            {saving ? 'Saving…' : 'SAVE QUOTE'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Main Quotes page ─────────────────────────────────────────────────── */
export default function Quotes() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/quotes').then(r => {
      setQuotes(r.data);
      setIdx(0);
    }).finally(() => setLoading(false));
  }, []);

  const prev = useCallback(() => setIdx(i => (i - 1 + quotes.length) % quotes.length), [quotes.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % quotes.length), [quotes.length]);

  function handleSaved(q: QuoteItem) {
    setQuotes(qs => [q, ...qs]);
    setIdx(0);
  }

  async function handleDelete(id: number) {
    await api.delete(`/quotes/${id}`);
    setQuotes(qs => {
      const next = qs.filter(q => q.id !== id);
      setIdx(i => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  }

  const current = quotes[idx] ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-head" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Wall of Fire
          </h1>
          <p className="text-xs mt-0.5 font-semibold tracking-widest uppercase" style={{ color: 'var(--t-faint)' }}>
            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'} saved
          </p>
        </div>

        {/* BIG ADD BUTTON */}
        <button onClick={() => setShowAdd(true)}
          className="tap flex items-center gap-2.5 px-5 py-3 rounded-2xl font-black text-sm tracking-wider"
          style={{
            background: '#d97757',
            color: '#1a1714',
            boxShadow: '0 8px 30px #d9775740, 0 0 0 1px #d9775720',
            letterSpacing: '0.08em',
          }}>
          <Plus size={18} strokeWidth={3} />
          ADD QUOTE
        </button>
      </div>

      {/* ── Main flashy tile ── */}
      {loading ? (
        <div className="rounded-3xl flex items-center justify-center" style={{ minHeight: 340, background: 'var(--s1)', border: '1.5px solid var(--b)' }}>
          <p className="text-sm" style={{ color: 'var(--t-faint)' }}>Loading…</p>
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-3xl flex flex-col items-center justify-center gap-4 text-center px-8"
          style={{ minHeight: 340, background: 'var(--s1)', border: '1.5px dashed var(--b)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: '#d9775718', border: '1px solid #d9775730' }}>
            <Quote size={28} style={{ color: '#d97757' }} />
          </div>
          <div>
            <p className="font-black text-head text-base" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              Your wall is empty
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--t-faint)' }}>
              Add a quote that fires you up — it'll live here like a cinematic scene.
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="tap px-6 py-2.5 rounded-2xl font-black text-sm"
            style={{ background: '#d97757', color: '#1a1714' }}>
            <Plus size={14} className="inline mr-1.5" strokeWidth={3} />
            Add your first quote
          </button>
        </div>
      ) : current ? (
        <QuoteTile quote={current} total={quotes.length} index={idx} onPrev={prev} onNext={next} />
      ) : null}

      {/* ── Quote vault — all cards ── */}
      {quotes.length > 0 && (
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--t-faint)' }}>
            Quote vault
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {quotes.map((q, i) => {
              const pal = ORB_PALETTES[i % ORB_PALETTES.length];
              const active = i === idx;
              return (
                <div key={q.id}
                  onClick={() => setIdx(i)}
                  className="relative group rounded-2xl px-5 py-4 cursor-pointer transition-all duration-200"
                  style={{
                    background: active ? `${pal.a}12` : 'var(--s1)',
                    border: active ? `1.5px solid ${pal.a}44` : '1px solid var(--b)',
                    boxShadow: active ? `0 8px 30px ${pal.a}18` : 'none',
                  }}>
                  <p className="text-sm leading-relaxed pr-6"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      color: active ? 'var(--t-head)' : 'var(--t-body)',
                      fontWeight: active ? 600 : 400,
                    }}>
                    {q.text.length > 120 ? q.text.slice(0, 120) + '…' : q.text}
                  </p>
                  {q.author && (
                    <p className="text-[10px] font-bold tracking-wider uppercase mt-2"
                      style={{ color: active ? pal.a : 'var(--t-faint)' }}>
                      — {q.author}
                    </p>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(q.id); }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity tap"
                    style={{ background: 'rgba(205,82,64,0.12)', color: '#e07b62' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && <AddQuoteModal onClose={() => setShowAdd(false)} onSaved={handleSaved} />}
    </div>
  );
}
