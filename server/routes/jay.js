const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const {
  aiEnabled, humanVoiceEnabled, converse, commitSheet, greeting,
} = require('../utils/jayBrain');

router.use(authMiddleware);

// GET /state — opening greeting + which engines are live
router.get('/state', (req, res) => {
  const profile = db.prepare('SELECT character_name FROM me_profile WHERE user_id=?').get(req.user.id);
  const name = profile?.character_name || req.user.username || null;
  res.json({
    ai: aiEnabled(),
    humanVoice: humanVoiceEnabled(),
    greeting: greeting(name),
    name,
  });
});

// POST /speak — ElevenLabs TTS proxy. The key stays server-side; the client
// just gets audio/mpeg back. body: { text }
router.post('/speak', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: 'human voice not configured' });

  const raw = (req.body.text || '').trim().slice(0, 1500);
  if (!raw) return res.status(400).json({ error: 'text required' });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb'; // Brian — deep natural male
  const model = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
  const isV3 = /v3/.test(model);
  // Non-v3 models read bracket tags out loud — strip them
  const text = isV3 ? raw : raw.replace(/\[[^\]]*\]\s*/g, '').trim();

  try {
    const body = { text, model_id: model };
    if (!isV3) {
      body.voice_settings = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
    }
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('[jay/speak] ElevenLabs', r.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'voice engine error' });
    }
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('[jay/speak]', e.message);
    res.status(502).json({ error: 'voice engine unreachable' });
  }
});

// POST /converse — one conversational turn.
// body: { transcript: [{ role: 'jay'|'user', text }] }
router.post('/converse', async (req, res) => {
  try {
    const transcript = (req.body.transcript || [])
      .filter(t => t && typeof t.text === 'string' && t.text.trim())
      .map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', text: t.text.trim() }));
    const result = await converse(req.user.id, transcript);
    res.json(result);
  } catch (e) {
    console.error('[jay/converse]', e.message);
    res.status(500).json({ error: 'Jay lost his train of thought — try again.' });
  }
});

// POST /commit — write the gathered sheet into every sector.
// body: { sheet: {...} }
router.post('/commit', (req, res) => {
  try {
    const filled = commitSheet(req.user.id, req.body.sheet || {});
    res.json({ filled });
  } catch (e) {
    console.error('[jay/commit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
