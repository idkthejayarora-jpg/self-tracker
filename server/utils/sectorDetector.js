'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR EXTRACTOR
// Pulls sector names directly from the user's own words — no fixed taxonomy.
// "I want to learn German" → sector "Learn German" (not "Learning")
// "get fit" → sector "Get Fit" (not "Health & Fitness")
// Only what the user actually wrote appears.
// ─────────────────────────────────────────────────────────────────────────────

// Infers icon + color from text — purely visual, does NOT define sector names
const CATEGORY_MAP = [
  { icon: '💪', color: '#22c55e', rx: /\b(health|fit|fitness|gym|workout|exercise|run|running|weight|lose|diet|sport|body|strength|muscle|yoga|meditat|cardio|swim|cycling|hiit|bulk|cut|physique|protein|calories|training)\b/i },
  { icon: '💼', color: '#0ea5e9', rx: /\b(career|work|job|profession|business|startup|company|freelance|client|income|hustle|salary|corporate|office|employ|promotion|professional|agency|entrepreneur|product|saas|side\s*hustle)\b/i },
  { icon: '📚', color: '#a855f7', rx: /\b(learn|study|read|books?|course|skill|language|german|french|spanish|japanese|chinese|korean|arabic|portuguese|italian|python|code|coding|degree|university|school|certif|diploma|education)\b/i },
  { icon: '💰', color: '#f59e0b', rx: /\b(money|financ|invest|saving|savings|wealth|debt|budget|rich|property|estate|passive|stocks?|crypto|portfolio|afford)\b/i },
  { icon: '🎨', color: '#f97316', rx: /\b(creat|art|draw|drawing|paint|painting|music|producing|production|compose|write|writing|design|film|filming|photo|photography|craft|guitar|piano|drums|bass|sing|sketch|illustration|content|blog|youtube|vlog|podcast)\b/i },
  { icon: '❤️',  color: '#f43f5e', rx: /\b(relationship|family|friend|friends|love|social|connect|partner|marriage|dating|community|people|romantic|bond|intimacy|support)\b/i },
  { icon: '🌱', color: '#14b8a6', rx: /\b(grow|growth|habit|habits|routine|discipline|mindset|confident|confidence|purpose|identity|journal|journaling|therapy|mental\s*health|aware|awareness|stoic|philosophy|values|character|self.?improv)\b/i },
  { icon: '✈️', color: '#06b6d4', rx: /\b(travel|trip|adventure|explore|visit|abroad|overseas|country|relocat|nomad|backpack|flight|destination|europe|asia|america|africa|berlin|tokyo|paris|bali|holiday|vacation)\b/i },
  { icon: '🏠', color: '#84cc16', rx: /\b(home|house|flat|apartment|property|move\s+out|own\s+a|buy\s+a)\b/i },
  { icon: '🧘', color: '#8b5cf6', rx: /\b(meditat|mindful|zen|spiritual|inner\s*peace|calm|breath|heal|wellbeing|self.?care)\b/i },
];

const DEFAULT_CAT = { icon: '⚡', color: '#6366f1' };

function inferCategory(text) {
  for (const cat of CATEGORY_MAP) {
    if (cat.rx.test(text)) return { icon: cat.icon, color: cat.color };
  }
  return DEFAULT_CAT;
}

// A clause needs at least one of these to be treated as a goal statement
const INTENT_RE = /\b(want\s+to|need\s+to|plan\s+to|hope\s+to|would\s+love\s+to|aspire\s+to|dream\s+of|been\s+meaning\s+to|always\s+wanted\s+to|trying\s+to|going\s+to|get\s+better\s+at|work\s+on|focus\s+on|get\s+into|learn|study|build|create|start|improve|develop|travel\s+to?|move\s+to|become|write\s+a|read\s+more|invest|save\s+money|launch|produce|make\s+a)\b/i;

// Ordered list of prefixes to strip — leaves just the raw topic
const STRIP = [
  /^(I|we)\s+(really\s+)?(also\s+)?(still\s+)?(just\s+)?(always\s+)?(haven'?t\s+)?(been\s+meaning\s+to\s+|want\s+to\s+|need\s+to\s+|hope\s+to\s+|plan\s+to\s+|would\s+love\s+to\s+|aspire\s+to\s+|dream\s+of\s+|always\s+wanted\s+to\s+|always\s+want\s+to\s+)/i,
  /^(want\s+to|need\s+to|plan\s+to|hope\s+to|would\s+love\s+to|aspire\s+to|dream\s+of|been\s+meaning\s+to|always\s+wanted\s+to|trying\s+to|going\s+to)\s+/i,
  /^(improve\s+(?:my\s+)?|work\s+on\s+(?:my\s+)?|focus\s+on\s+(?:my\s+)?|get\s+better\s+at\s+|develop\s+(?:my\s+)?|get\s+into\s+)/i,
];

function extractTopic(clause) {
  let s = clause.trim();

  // Apply strips in order
  for (const pat of STRIP) {
    s = s.replace(pat, '');
  }

  // Remove remaining leading articles/possessives
  s = s.replace(/^(my\s+|a\s+|an\s+|the\s+|his\s+|her\s+|our\s+|your\s+)/i, '');

  if (!s || s.length < 2) return null;

  // Walk word-by-word; stop at coordinating conjunctions once ≥2 words collected
  const words = s.split(/\s+/);
  const kept = [];
  for (const w of words) {
    const clean = w.replace(/[,;.!?'"—–]+$/g, '');
    if (!clean) continue;
    const isConj = /^(and|but|or|also|plus|because|since|so|then|though|although|while|where|when|as|eventually|someday|for|ages|around|maybe|perhaps|hopefully)$/i.test(clean);
    if (isConj && kept.length >= 2) break;
    kept.push(clean);
    if (kept.length >= 5) break;
  }

  let topic = kept.join(' ');

  // Remove possessive mid-phrase
  topic = topic.replace(/\bmy\b/gi, '').replace(/\s+/g, ' ').trim();

  // Strip trailing filler
  topic = topic.replace(/\s+(a|an|the|some|more|lot|bit|little|up|out|on|at|in|of|for|it|this|eventually|someday|ages|more|better|soon)$/gi, '').trim();
  topic = topic.replace(/[.!?,'"—–]+$/g, '').trim();

  // Title case (keep short prepositions lowercase unless first word)
  const LOWER = new Set(['a','an','the','at','by','for','in','of','on','to','up','and','but','or','nor','so','yet','with','from','into','onto','over','out']);
  topic = topic.split(' ').map((w, i) => {
    const l = w.toLowerCase();
    if (i > 0 && LOWER.has(l)) return l;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');

  if (topic.length < 3 || topic.length > 55) return null;
  if (/^(a|an|the|in|on|at|to|of|for|with|and|but)$/i.test(topic)) return null;

  return topic;
}

/**
 * Extracts sectors from free-form text.
 * Returns array of { name, icon, color } — names are the user's own words.
 */
function extractSectors(text) {
  // Split into clauses: sentence boundaries, em-dashes, semicolons,
  // and commas/connectors immediately before intent verbs
  const clauses = text
    .split(/[.!?\n;—–]+|,\s*(?=(?:start|learn|build|make|create|get|travel|write|read|invest|save|improve|work|develop|plan|want|need|hope|also\s|and\s+I\s)\b)/i)
    .map(s => s.trim())
    .filter(s => s.length >= 6);

  const results = [];
  const seenLower = new Set();

  for (const clause of clauses) {
    if (!INTENT_RE.test(clause)) continue;

    const name = extractTopic(clause);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);

    const { icon, color } = inferCategory(clause + ' ' + name);
    results.push({ name, icon, color });
  }

  return results;
}

module.exports = { extractSectors };
