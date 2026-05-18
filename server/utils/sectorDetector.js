'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR EXTRACTOR
// Pulls sector names directly from the user's own words — no fixed taxonomy.
// "I want to learn German" → "Learn German"
// "get fit and lose weight" → "Get Fit"
// ─────────────────────────────────────────────────────────────────────────────

// No trailing \b — allows stem matching: "draw" matches "drawing", "invest" matches "investing", etc.
const CATEGORY_MAP = [
  { icon: '💪', color: '#22c55e', rx: /\b(health|fit|gym|workout|exercise|running|weight|lose|diet|sport|strength|muscle|yoga|cardio|swim|cycling|training|physique|protein|calori)/i },
  { icon: '💼', color: '#0ea5e9', rx: /\b(career|job|profession|business|startup|company|freelance|client|income|hustle|salary|corporate|entrepreneur|product|saas|launch)/i },
  { icon: '📚', color: '#a855f7', rx: /\b(learn|study|read|course|skill|language|german|french|spanish|japanese|chinese|korean|arabic|italian|python|cod|degree|university|school|certif|diploma|education)/i },
  { icon: '💰', color: '#f59e0b', rx: /\b(money|financ|invest|saving|wealth|debt|budget|rich|property|estate|passive|stock|crypto|portfolio|afford)/i },
  { icon: '🎨', color: '#f97316', rx: /\b(creat|art|draw|paint|music|produc|compos|writ|design|film|photo|craft|guitar|piano|drums|bass|sing|sketch|illustrat|content|blog|youtube|vlog|podcast|cook)/i },
  { icon: '❤️',  color: '#f43f5e', rx: /\b(relationship|family|friend|love|social|connect|partner|marriage|dating|community|romantic|bond|intimacy|support)/i },
  { icon: '🌱', color: '#14b8a6', rx: /\b(grow|habit|routine|disciplin|mindset|confiden|purpose|identity|journal|therapy|mental|aware|stoic|philosoph|values|character|self.improv)/i },
  { icon: '✈️', color: '#06b6d4', rx: /\b(travel|trip|adventure|explore|visit|abroad|overseas|country|relocat|nomad|backpack|flight|destination|europe|asia|america|africa|berlin|tokyo|paris|bali|holiday|vacation)/i },
  { icon: '🏠', color: '#84cc16', rx: /\b(home|house|flat|apartment|property)/i },
  { icon: '🧘', color: '#8b5cf6', rx: /\b(meditat|mindful|zen|spiritual|inner.peace|calm|breath|heal|wellbeing|self.care)/i },
];

const DEFAULT_CAT = { icon: '⚡', color: '#6366f1' };

// Infer from the extracted topic NAME only (not the full clause),
// so "Discipline" gets 🌱 even if its clause contained "work"
function inferCategory(name) {
  for (const cat of CATEGORY_MAP) {
    if (cat.rx.test(name)) return { icon: cat.icon, color: cat.color };
  }
  return DEFAULT_CAT;
}

// A clause needs at least one of these to be treated as a goal statement
const INTENT_RE = /\b(want\s+to|need\s+to|plan\s+to|planning\s+to|hope\s+to|would\s+love\s+to|aspire\s+to|dream\s+of|been\s+meaning\s+to|have\s+been\s+meaning|always\s+wanted\s+to|trying\s+to|going\s+to|get\s+better\s+at|work\s+on|focus\s+on|get\s+into|learn|study|build|create|start|improve|develop|travel\s+to?|move\s+to|become|write\s+a|read\s+more|invest|save\s+money|launch|produce|make\s+a|get\s+fit|lose\s+weight|sort\s+out)\b/i;

// Hard stops (and/or/but) — end topic after >= 1 word
const HARD_STOP_RE = /^(and|or|but|nor)$/i;
// Soft stops — end topic after >= 2 words
const SOFT_STOP_RE = /^(also|plus|because|since|so|then|though|although|while|where|when|as|eventually|someday|maybe|perhaps|hopefully|soon|already|anyway|unless|until|after|before|once|if|this|next|by|until|year|years|month|months|week|weeks|day|days)$/i;
// Prepositions that end a topic after >= 2 words
const PREP_STOP_RE = /^(for|from|into|onto|over|out)$/i;

/**
 * Given a clause, strips all the intent/filler prefix and returns just the topic.
 */
function extractTopic(clause) {
  let s = clause.trim();

  // 1. Strip leading connectors/adverbs — loop until stable (handles "Also really", "And also just", etc.)
  const CONNECTOR_RE = /^(also|really|just|maybe|perhaps|eventually|someday|honestly|definitely|seriously|actually|basically|anyway|still|yet|plus|even|oh\s+and|and\s+also)\s+/i;
  let prev = '';
  while (s !== prev) { prev = s; s = s.replace(CONNECTOR_RE, ''); }

  // 2. Strip subject "I" or "we" with optional filler words
  s = s.replace(/^(I|we)\s+(really\s+)?(also\s+)?(still\s+)?(just\s+)?(always\s+)?(honestly\s+)?(definitely\s+)?/i, '');

  // 3. Strip "have/haven't been meaning to" / "'ve been meaning to"
  s = s.replace(/^(have\s+been|haven'?t\s+been|'ve\s+been)\s+meaning\s+to\s+/i, '');
  s = s.replace(/^been\s+meaning\s+to\s+/i, '');
  // Strip "have been wanting/trying to" etc.
  s = s.replace(/^(have\s+been|'ve\s+been)\s+\w+ing\s+to\s+/i, '');

  // 4. Strip intent verb phrases (includes planning to)
  s = s.replace(/^(want\s+to|need\s+to|plan\s+to|planning\s+to|hope\s+to|would\s+love\s+to|aspire\s+to|dream\s+of|always\s+wanted\s+to|always\s+want\s+to|trying\s+to|going\s+to)\s+/i, '');

  // 5. Strip action modifiers: "improve my", "work on my", "get better at", "sort out my"
  s = s.replace(/^(get\s+better\s+at|work\s+on\s+(?:my\s+)?|focus\s+on\s+(?:my\s+)?|improve\s+(?:my\s+)?|develop\s+(?:my\s+)?|build\s+(?:my\s+)?|get\s+into|sort\s+out\s+(?:my\s+)?)\s*/i, '');

  // 6. Strip leading articles/possessives
  s = s.replace(/^(my\s+|a\s+|an\s+|the\s+|his\s+|her\s+|our\s+|your\s+)/i, '');

  s = s.trim();
  if (!s || s.length < 2) return null;

  // 7. Walk word-by-word collecting the topic
  const words = s.split(/\s+/);
  const kept = [];
  for (const w of words) {
    const clean = w.replace(/[,;.!?'"—–]+$/g, '').replace(/^['"—–]+/, '');
    if (!clean) continue;

    // Hard stop (and/or/but) — always stop once we have at least 1 real word
    if (HARD_STOP_RE.test(clean) && kept.length >= 1) break;

    // Soft stop — stop after 2+ words
    if (SOFT_STOP_RE.test(clean) && kept.length >= 2) break;

    // Preposition stop — stop after 2+ words
    if (PREP_STOP_RE.test(clean) && kept.length >= 2) break;

    // "to" after >= 2 words: stop (avoids "Move to Berlin" becoming "Move to Berlin Eventually")
    // but keep "to" as part of "Move to" if we only have 1 word
    const isTo = /^to$/i.test(clean);
    if (isTo && kept.length >= 2) break;

    kept.push(clean);
    if (kept.length >= 5) break;
  }

  let topic = kept.join(' ');

  // Remove possessive mid-phrase
  topic = topic.replace(/\bmy\b/gi, '').replace(/\s+/g, ' ').trim();

  // Strip trailing filler/time words
  topic = topic.replace(/\s+(a|an|the|some|more|lot|bit|little|up|out|on|at|in|of|for|it|this|that|eventually|someday|ages|better|soon|one|day|already|much|too|year|years|month|months|week|weeks)$/gi, '').trim();
  topic = topic.replace(/[.!?,'"—–]+$/g, '').trim();

  // Title case
  const LOWER_WORDS = new Set(['a','an','the','at','by','for','in','of','on','to','up','and','but','or','nor','so','yet','with','from','into','onto','over','out']);
  topic = topic.split(' ').map((w, i) => {
    if (!w) return w;
    const l = w.toLowerCase();
    if (i > 0 && LOWER_WORDS.has(l)) return l;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');

  if (topic.length < 3 || topic.length > 50) return null;
  if (/^(a|an|the|in|on|at|to|of|for|with|and|but|my|your|his|her|our|it|this|or|if)$/i.test(topic)) return null;

  // Reject if first word is still an intent/filler verb that slipped through
  const firstWord = topic.split(' ')[0].toLowerCase();
  if (/^(want|need|plan|hope|would|aspire|dream|always|trying|going|been|have|haven|meaning|improving|working|focusing|developing|building|getting|starting|sorting)$/.test(firstWord)) return null;

  return topic;
}

/**
 * Extracts sectors from free-form text.
 * Returns array of { name, icon, color } — names are the user's own words.
 */
// Intent verbs used in both the comma-split and the AND-split
const SPLIT_VERBS = 'also|and\\s+I|start|learn|build|make|create|get|travel|write|read|invest|save|improve|work|develop|plan|want|need|hope|sort|launch|produce|move|become|study|code|draw|run|grow|fix|design|record|practice|open|join|find|try|go';
const SPLIT_VERBS_RE = new RegExp(`(?:${SPLIT_VERBS})\\b`, 'i');

function extractSectors(text) {
  // Primary split: sentence boundaries + comma-before-intent-verb
  const primary = text
    .split(new RegExp(`[.!?\\n;—–]+|,\\s*(?=(?:${SPLIT_VERBS})\\b)`, 'i'))
    .map(s => s.trim())
    .filter(s => s.length >= 6);

  // Secondary split: within each clause, split on " and " before an intent verb
  // e.g. "build my kamal brand and get fit" → ["build my kamal brand", "get fit"]
  const clauses = [];
  for (const clause of primary) {
    const parts = clause.split(/\s+and\s+(?=[a-zA-Z])/i);
    // Only split if the next part has an intent verb — otherwise keep together
    const expanded = [];
    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
      if (SPLIT_VERBS_RE.test(parts[i]) || INTENT_RE.test(parts[i])) {
        expanded.push(acc);
        acc = parts[i];
      } else {
        acc += ' and ' + parts[i];
      }
    }
    expanded.push(acc);
    clauses.push(...expanded.map(s => s.trim()).filter(s => s.length >= 4));
  }

  const results = [];
  const seenLower = new Set();

  for (const clause of clauses) {
    if (!INTENT_RE.test(clause)) continue;

    const name = extractTopic(clause);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seenLower.has(key)) continue;
    seenLower.add(key);

    const { icon, color } = inferCategory(name);
    results.push({ name, icon, color });
  }

  return results;
}

module.exports = { extractSectors };
