'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMBITIONS PARSER
// Takes raw free-text about life goals, returns structured goal cards with
// feasibility estimates (hours → days → weeks → months → years).
// No external API — pure keyword/regex matching + heuristics.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_META = {
  hours:  { label: 'Quick Win',   color: '#22c55e', bg: '#22c55e18', desc: 'Can start & finish today' },
  days:   { label: 'Short Term',  color: '#3b82f6', bg: '#3b82f618', desc: 'A few days of effort' },
  weeks:  { label: 'Near Term',   color: '#a855f7', bg: '#a855f718', desc: 'A few weeks of work' },
  months: { label: 'Mid Term',    color: '#f97316', bg: '#f9731618', desc: 'Months of consistency' },
  years:  { label: 'Long Game',   color: '#ef4444', bg: '#ef444418', desc: 'Year-plus commitment' },
};

// Known goals catalog — ordered from most specific to most general
const CATALOG = [
  // ── Languages ──
  { rx: /\b(learn|speak|study|understand)\b.{0,20}\b(german|deutsch)\b/i,      title: 'Learn German',       icon: '🇩🇪', bucket: 'months', note: 'A2 basics in ~3 months · B2 fluency in 12–18 months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(french|français)\b/i,               title: 'Learn French',       icon: '🇫🇷', bucket: 'months', note: 'Conversational in 3–6 months · fluent in 18+ months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(spanish|español)\b/i,               title: 'Learn Spanish',      icon: '🇪🇸', bucket: 'months', note: 'Fastest of major languages — conversational in 3 months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(japanese|nihongo)\b/i,              title: 'Learn Japanese',     icon: '🇯🇵', bucket: 'years',  note: 'Basic conversation in 6–12 months · fluency in 3+ years' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(mandarin|chinese)\b/i,             title: 'Learn Mandarin',     icon: '🇨🇳', bucket: 'years',  note: '2–4 years for conversational fluency' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(arabic)\b/i,                       title: 'Learn Arabic',       icon: '🌙',  bucket: 'years',  note: '2+ years — one of the hardest for English speakers' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(hindi)\b/i,                        title: 'Learn Hindi',        icon: '🇮🇳', bucket: 'months', note: 'Script in weeks · conversational in 3–6 months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(korean|hangul)\b/i,                title: 'Learn Korean',       icon: '🇰🇷', bucket: 'months', note: 'Hangul in 1–2 days · conversational in 6–12 months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(portuguese|brazil)\b/i,            title: 'Learn Portuguese',   icon: '🇧🇷', bucket: 'months', note: 'Similar to Spanish — basics in 2–3 months' },
  { rx: /\b(learn|speak|study)\b.{0,20}\b(italian)\b/i,                      title: 'Learn Italian',      icon: '🇮🇹', bucket: 'months', note: 'Romantic language — basics in 2–4 months' },

  // ── Fitness ──
  { rx: /\b(run|finish|complete|train\s+for)\b.{0,20}\bmarathon\b/i,         title: 'Run a marathon',     icon: '🏃', bucket: 'months', note: '16–20 weeks of structured training from base fitness' },
  { rx: /\b(run|do)\b.{0,10}\b(5k|5\s*km)\b/i,                              title: 'Run a 5K',           icon: '🏃', bucket: 'weeks',  note: 'Couch to 5K: 8 weeks' },
  { rx: /\b(run|do)\b.{0,10}\b(10k|10\s*km)\b/i,                            title: 'Run a 10K',          icon: '🏃', bucket: 'months', note: '8–12 weeks from 5K base' },
  { rx: /\b(lose|drop|shed)\b.{0,20}\b(weight|kg|pounds?|lbs?|fat)\b/i,     title: 'Lose weight',        icon: '⚖️', bucket: 'months', note: '0.5–1 kg/week with diet + exercise — 2–6 months for real change' },
  { rx: /\b(build|gain|grow)\b.{0,20}\b(muscle|mass|bulk|physique)\b/i,     title: 'Build muscle',       icon: '💪', bucket: 'months', note: 'Visible gains in 2–3 months · serious physique in 1–2 years' },
  { rx: /\bget\s+(fit|in\s+shape|ripped|shredded|lean)\b/i,                 title: 'Get in shape',       icon: '🏋️', bucket: 'months', note: '3 months to feel the change · 6 months to look it' },
  { rx: /\b(do|learn|master)\b.{0,20}\b(pull.?up|chin.?up)\b/i,             title: 'Master pull-ups',    icon: '🏋️', bucket: 'weeks',  note: 'First pull-up in 4–8 weeks of progressive training' },
  { rx: /\b(calisthenics|bodyweight)\b/i,                                    title: 'Calisthenics',       icon: '🤸', bucket: 'months', note: 'Basics in weeks · advanced moves (planche, front lever) in years' },
  { rx: /\b(yoga|flexibility|stretching)\b/i,                                title: 'Yoga / flexibility', icon: '🧘', bucket: 'weeks',  note: 'Noticeable flexibility in 3–4 weeks of daily practice' },
  { rx: /\b(swim|swimming)\b/i,                                              title: 'Swimming',           icon: '🏊', bucket: 'weeks',  note: 'Learn basics in 1–2 weeks · strong technique in months' },
  { rx: /\b(boxing|martial\s*arts?|mma|jiu.?jitsu|karate|muay\s*thai)\b/i, title: 'Martial arts',       icon: '🥊', bucket: 'months', note: 'Fundamentals in 3–6 months · competence takes years' },

  // ── Creative ──
  { rx: /\b(draw|sketch|illustration|illustrate|figure\s+drawing)\b/i,       title: 'Drawing / Sketching',icon: '✏️', bucket: 'hours',  note: 'One sketch: 20–60 min · consistently good: 6–12 months' },
  { rx: /\b(paint|painting|watercolour|oil\s+paint|acrylic)\b/i,            title: 'Painting',           icon: '🎨', bucket: 'hours',  note: 'One painting: a few hours · artistic fluency: months' },
  { rx: /\b(write|finish|publish)\b.{0,20}\b(book|novel|memoir)\b/i,        title: 'Write a book',       icon: '📖', bucket: 'months', note: 'First draft in 3–6 months · published in 12–24 months' },
  { rx: /\b(write)\b.{0,20}\b(short\s*story|poem|screenplay|script)\b/i,   title: 'Creative writing',   icon: '📝', bucket: 'days',   note: 'Draft in a few hours · polished in 1–3 days' },
  { rx: /\b(learn|play|master)\b.{0,20}\b(guitar)\b/i,                      title: 'Play guitar',        icon: '🎸', bucket: 'months', note: 'First songs in 2–4 weeks · solid player in 6–12 months' },
  { rx: /\b(learn|play|master)\b.{0,20}\b(piano|keyboard)\b/i,              title: 'Play piano',         icon: '🎹', bucket: 'months', note: 'Simple songs in 1–2 months · real musicality in 1–2 years' },
  { rx: /\b(learn|play|master)\b.{0,20}\b(drums|drumming)\b/i,              title: 'Play drums',         icon: '🥁', bucket: 'months', note: 'Basic beats in 1–2 months · groove in 6–12 months' },
  { rx: /\b(produce|music\s*production|make\s+music|beatmaking|fl\s*studio|ableton)\b/i, title: 'Music production', icon: '🎧', bucket: 'months', note: 'First track in weeks · quality output in 3–6+ months' },
  { rx: /\b(photography|take\s+photos|shoot\s+portraits|camera)\b/i,        title: 'Photography',        icon: '📷', bucket: 'weeks',  note: 'Camera basics in 1–2 weeks · artistic eye in months' },
  { rx: /\b(video|film|vlog|youtube|reel|short\s+film)\b/i,                 title: 'Video creation',     icon: '🎬', bucket: 'weeks',  note: 'First video: days · consistent quality: weeks' },
  { rx: /\b(design|graphic\s*design|figma|photoshop|illustrator|ui|ux)\b/i, title: 'Design',             icon: '🖌️', bucket: 'months', note: 'Tool basics in weeks · professional quality in months' },

  // ── Tech / Code ──
  { rx: /\b(learn|code|build\s+with)\b.{0,20}\bpython\b/i,                  title: 'Learn Python',       icon: '🐍', bucket: 'weeks',  note: 'Basics in 2–4 weeks · real projects in 2–3 months' },
  { rx: /\b(learn|code)\b.{0,20}\b(javascript|typescript|react|vue|web\s*dev)\b/i, title: 'Web development', icon: '💻', bucket: 'months', note: 'HTML/CSS in weeks · full stack in 3–6 months' },
  { rx: /\b(build|launch|ship|make|create)\b.{0,30}\b(app|startup|product|saas|tool)\b/i, title: 'Build a product', icon: '🚀', bucket: 'months', note: 'MVP in 1–3 months · market traction in 6–18 months' },
  { rx: /\b(machine\s*learning|deep\s*learning|ai|data\s*science|llm)\b/i,  title: 'Learn ML / AI',      icon: '🤖', bucket: 'months', note: 'Foundations in 2–3 months · applied projects in 6+ months' },
  { rx: /\b(cybersecurity|ethical\s*hack|pen\s*test)\b/i,                   title: 'Cybersecurity',      icon: '🔐', bucket: 'months', note: 'Certs like CompTIA Security+ take 2–3 months of study' },
  { rx: /\b(blockchain|web3|solidity|crypto\s*dev)\b/i,                     title: 'Web3 / blockchain',  icon: '⛓️', bucket: 'months', note: 'Solidity basics in weeks · production-ready in months' },

  // ── Business / Career ──
  { rx: /\b(start|launch|build|open|run)\b.{0,20}\b(business|company|agency|brand|studio)\b/i, title: 'Start a business', icon: '🏢', bucket: 'months', note: 'Register & first client in weeks · sustainable in 6–24 months' },
  { rx: /\b(freelance|freelancing|go\s+freelance|own\s+clients?)\b/i,       title: 'Go freelance',       icon: '💼', bucket: 'months', note: 'First clients in 1–3 months · stable income in 6–12 months' },
  { rx: /\b(public\s*speaking|speak\s+on\s+stage|ted\s*talk|presentation\s+skills?)\b/i, title: 'Public speaking', icon: '🎤', bucket: 'months', note: 'Toastmasters: 3–6 months to real confidence' },
  { rx: /\b(get|land|find)\b.{0,20}\b(job|role|position|hired)\b/i,        title: 'Land a job',         icon: '🎯', bucket: 'months', note: 'Active search usually takes 1–6 months' },
  { rx: /\b(career\s*change|switch\s+careers?|pivot)\b/i,                   title: 'Career change',      icon: '🔄', bucket: 'months', note: 'Upskilling + job search: 3–12 months minimum' },
  { rx: /\b(network|linkedin|build.{0,10}connections?|personal\s*brand)\b/i, title: 'Build personal brand', icon: '🤝', bucket: 'months', note: 'First traction in weeks · recognisable brand in months' },
  { rx: /\b(invest|investing|stocks?|etf|portfolio|compound)\b/i,           title: 'Investing',          icon: '📈', bucket: 'weeks',  note: 'Account + first investment in days · learning the game: ongoing' },
  { rx: /\b(save|savings?|emergency\s*fund|financial\s*freedom)\b/i,        title: 'Build savings',      icon: '💰', bucket: 'months', note: 'Habit locks in within 30 days · meaningful savings in months' },

  // ── Health / Mindset ──
  { rx: /\b(meditat|mindfulness|zen)\b/i,                                    title: 'Meditation habit',   icon: '🧘', bucket: 'days',   note: 'First session: 10 min now · habit in 2–3 weeks' },
  { rx: /\b(quit|stop)\b.{0,20}\b(smok|cigarette|vap)\b/i,                  title: 'Quit smoking',       icon: '🚭', bucket: 'months', note: 'Nicotine-free in 2–4 weeks · cravings fade in 3–6 months' },
  { rx: /\b(eat\s+(healthy|better|clean|well)|clean\s*eating|nutrition)\b/i, title: 'Eat healthier',     icon: '🥗', bucket: 'weeks',  note: 'New habits solidify in 2–4 weeks · body changes in months' },
  { rx: /\b(fix|improve|better)\b.{0,15}\bsleep\b/i,                        title: 'Fix sleep schedule', icon: '😴', bucket: 'weeks',  note: 'New rhythm in 1–2 weeks of consistency' },
  { rx: /\b(therapy|therapist|counselling|mental\s*health|self.?aware)\b/i, title: 'Work on mental health', icon: '🧠', bucket: 'months', note: 'Ongoing — meaningful shifts in 1–3 months' },
  { rx: /\b(cold\s*shower|wim\s*hof|ice\s*bath)\b/i,                        title: 'Cold exposure habit', icon: '🧊', bucket: 'days',  note: 'Start today — habit in 2–3 weeks' },
  { rx: /\b(wake\s+up\s+early|morning\s*routine|5\s*am|6\s*am)\b/i,         title: 'Morning routine',    icon: '☀️', bucket: 'weeks',  note: 'Consistent schedule in 2–3 weeks' },

  // ── Travel / Life ──
  { rx: /\b(travel|visit|go\s+to|trip\s+to)\b.{0,30}\b(abroad|overseas|europe|asia|japan|germany|france|spain|italy|india|bali)\b/i, title: 'Travel abroad', icon: '✈️', bucket: 'months', note: 'Budget + plan: 1–3 months · just book it: weeks' },
  { rx: /\b(move\s+out|own\s+(a\s+)?house|buy\s+(a\s+)?home|property)\b/i,  title: 'Own a home',         icon: '🏠', bucket: 'years',  note: '1–5+ years depending on location and savings rate' },
  { rx: /\b(move\s+to|relocate|emigrate|live\s+in)\b.{0,30}\b(abroad|overseas|another\s+country|uk|usa|europe|canada|australia)\b/i, title: 'Move abroad', icon: '🌍', bucket: 'months', note: 'Visa + planning: 3–12 months depending on destination' },

  // ── Quick wins ──
  { rx: /\b(read)\b.{0,20}\b(book)\b/i,                                      title: 'Read a book',        icon: '📚', bucket: 'days',   note: 'Average book: 3–7 days at moderate pace' },
  { rx: /\b(journal|journaling|daily\s+journal)\b/i,                         title: 'Daily journaling',   icon: '📓', bucket: 'days',   note: 'Start today: 5–10 min · habit in 21 days' },
  { rx: /\b(clean|declutter|organise|organize)\b.{0,20}\b(room|home|space|desk)\b/i, title: 'Declutter & organise', icon: '🧹', bucket: 'days', note: 'One room: a few hours · full home: a weekend' },
  { rx: /\b(update|write|build|make)\b.{0,20}\b(cv|resume|portfolio)\b/i,   title: 'Update CV / portfolio', icon: '📄', bucket: 'days', note: '1–3 days of focused work' },
];

// Intent trigger — sentence must contain one of these to be treated as a goal
const INTENT_RX = /\b(want|learn|become|build|start|create|improve|master|develop|study|practice|get\s+into|get\s+better|work\s+on|achieve|reach|grow|pursue|explore|make|write|read|travel|move|launch|run|train|lose|gain|earn|save|invest|finish|teach\s+myself|teach\s+myself|ambitious|aspir|dream|goal|plan\s+to|hoping\s+to|try\s+to|going\s+to)\b/i;

function estimateBucketFromSentence(sentence) {
  const s = sentence.toLowerCase();
  if (/\b(fluent|master|expert|professional|years?|lifetime|career|long.?term|degree|phd|doctorate)\b/.test(s)) return 'years';
  if (/\b(months?|certification|certif|diploma|license|licence|habit|consistent|ongoing)\b/.test(s)) return 'months';
  if (/\b(weeks?|practice|training|routine|beginner|basics|intro|foundation)\b/.test(s)) return 'weeks';
  if (/\b(days?|quickly|fast|soon|book|read|one\s+time|single|today|tonight|this\s+week)\b/.test(s)) return 'days';
  return 'weeks';
}

function extractTitleFromSentence(sentence) {
  const STRIP = /^(i\s+)?(really\s+)?(also\s+)?(want\s+to|need\s+to|would\s+love\s+to|plan\s+to|hope\s+to|trying\s+to|going\s+to|wish\s+i\s+could|dream\s+of|aspire\s+to)\s+/i;
  let s = sentence.replace(STRIP, '').trim();
  // Cut at conjunctions or clause boundaries
  s = s.replace(/\s+(and\s+also|but\s+|because\s+|so\s+that|which\s+|that\s+would|,\s+and|,\s+but).*/i, '').trim();
  s = s.replace(/[.!?]+$/, '').trim();
  // Capitalise
  if (s.length >= 4 && s.length <= 60) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return null;
}

function inferIconFromSentence(sentence) {
  const s = sentence.toLowerCase();
  if (/code|program|software|app|tech|dev|web/.test(s))       return '💻';
  if (/music|sing|song|band|drum|guitar|piano|produce/.test(s)) return '🎵';
  if (/fit|gym|workout|run|sport|health|body|strength/.test(s)) return '💪';
  if (/money|financ|invest|save|earn|rich|wealth/.test(s))     return '💰';
  if (/write|story|book|blog|author|novel|script/.test(s))     return '📝';
  if (/travel|trip|move|abroad|country|flight/.test(s))        return '✈️';
  if (/art|draw|design|creative|paint|sketch/.test(s))         return '🎨';
  if (/family|relationship|love|friend|connect/.test(s))       return '❤️';
  if (/learn|study|school|university|degree|course/.test(s))   return '📚';
  if (/business|startup|company|entrepreneur|brand/.test(s))   return '🚀';
  if (/health|eat|diet|sleep|meditat|mind/.test(s))            return '🧘';
  return '⚡';
}

function parseAmbitions(text) {
  const found = [];
  const usedTitles = new Set();

  // 1. Match against known catalog first (most accurate)
  for (const entry of CATALOG) {
    if (entry.rx.test(text) && !usedTitles.has(entry.title)) {
      usedTitles.add(entry.title);
      found.push({
        title:  entry.title,
        icon:   entry.icon,
        bucket: entry.bucket,
        note:   entry.note,
        ...BUCKET_META[entry.bucket],
      });
    }
  }

  // 2. Scan sentence-by-sentence for goals NOT caught by catalog
  const sentences = text
    .split(/(?<=[.!?\n])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(s => s.length > 12);

  for (const sentence of sentences) {
    if (!INTENT_RX.test(sentence)) continue;

    // Check if sentence content is already covered by a catalog match
    const lc = sentence.toLowerCase();
    const alreadyCovered = found.some(f =>
      lc.includes(f.title.toLowerCase().split('/')[0].trim().split(' ').slice(-1)[0])
    );
    if (alreadyCovered) continue;

    const title = extractTitleFromSentence(sentence);
    if (!title || usedTitles.has(title)) continue;

    // Avoid near-duplicates
    const isDupe = [...usedTitles].some(t =>
      t.toLowerCase().split(' ').some(w => w.length > 4 && title.toLowerCase().includes(w))
    );
    if (isDupe) continue;

    usedTitles.add(title);
    const bucket = estimateBucketFromSentence(sentence);
    found.push({
      title,
      icon:   inferIconFromSentence(sentence),
      bucket,
      note:   null,
      ...BUCKET_META[bucket],
    });
  }

  // 3. Sort by feasibility: quick wins first, long games last
  const ORDER = { hours: 0, days: 1, weeks: 2, months: 3, years: 4 };
  found.sort((a, b) => ORDER[a.bucket] - ORDER[b.bucket]);

  return found;
}

function generateSummary(goals) {
  if (!goals.length) return null;

  const quickWins   = goals.filter(g => g.bucket === 'hours' || g.bucket === 'days');
  const midTerm     = goals.filter(g => g.bucket === 'weeks' || g.bucket === 'months');
  const longTerm    = goals.filter(g => g.bucket === 'years');

  const parts = [];
  if (quickWins.length)  parts.push(`${quickWins.length} goal${quickWins.length > 1 ? 's' : ''} you could start today`);
  if (midTerm.length)    parts.push(`${midTerm.length} that need weeks to months of effort`);
  if (longTerm.length)   parts.push(`${longTerm.length} long-game commitment${longTerm.length > 1 ? 's' : ''}`);

  return `Detected ${goals.length} ambition${goals.length > 1 ? 's' : ''}: ${parts.join(', ')}.`;
}

module.exports = { parseAmbitions, generateSummary, BUCKET_META };
