'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR DETECTOR
// Maps free-text brain-dump to canonical life sectors.
// ─────────────────────────────────────────────────────────────────────────────

const SECTORS = [
  {
    name: 'Health & Fitness', icon: '💪', color: '#22c55e',
    rx: /\b(health|fit|fitness|gym|workout|exercise|run|running|weight|diet|sleep|sport|body|strength|muscle|yoga|meditat|cardio|swim|cycling|hiit|nutrition|calories|protein|cut|bulk|physique)\b/i,
  },
  {
    name: 'Career & Work', icon: '💼', color: '#0ea5e9',
    rx: /\b(career|work|job|profession|business|startup|company|freelance|client|income|hustle|salary|corporate|office|employed|employment|promotion|professional|side\s*hustle|entrepreneur|agency)\b/i,
  },
  {
    name: 'Learning', icon: '📚', color: '#a855f7',
    rx: /\b(learn|study|read|book|books|course|skill|skills|language|german|french|spanish|japanese|chinese|korean|arabic|python|code|coding|degree|university|school|class|certif|certificate|diploma|knowledge|education)\b/i,
  },
  {
    name: 'Finance', icon: '💰', color: '#f59e0b',
    rx: /\b(money|financ|invest|saving|savings|wealth|debt|budget|rich|property|estate|afford|income|passive\s*income|stocks?|crypto|portfolio|financial\s*freedom|net\s*worth)\b/i,
  },
  {
    name: 'Creativity', icon: '🎨', color: '#f97316',
    rx: /\b(creat|art|draw|drawing|paint|painting|music|write|writing|design|film|filming|photo|photography|craft|produce|production|guitar|piano|drums|sing|sketch|illustration|content|blog|youtube|vlog|podcast)\b/i,
  },
  {
    name: 'Relationships', icon: '❤️', color: '#f43f5e',
    rx: /\b(relationship|family|friend|friends|love|social|connect|partner|marriage|dating|network|community|people|romantic|bond|intimacy|support)\b/i,
  },
  {
    name: 'Personal Growth', icon: '🌱', color: '#14b8a6',
    rx: /\b(grow|growth|self|personal|improve|develop|habit|habits|routine|discipline|mindset|confident|confidence|purpose|identity|journal|journaling|therapy|mental\s*health|aware|awareness|stoic|philosophy|values|character)\b/i,
  },
  {
    name: 'Travel & Adventure', icon: '✈️', color: '#06b6d4',
    rx: /\b(travel|trip|adventure|explore|visit|abroad|overseas|country|move|relocate|nomad|backpack|flight|destination|europe|asia|america|africa|berlin|tokyo|paris|bali|holiday|vacation)\b/i,
  },
];

/**
 * Returns the subset of SECTORS that are mentioned in the text.
 * Preserves canonical order (Health first, Travel last).
 */
function detectSectors(text) {
  return SECTORS.filter(s => s.rx.test(text));
}

module.exports = { detectSectors, SECTORS };
