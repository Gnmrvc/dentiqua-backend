require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const axios    = require('axios');
const FormData = require('form-data');

// ── Konfiguration ─────────────────────────────────────────────────
const PORT            = process.env.PORT || 3001;
const VOICE_ID        = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL   || 'eleven_multilingual_v2';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const app       = express();

// ── CORS ──────────────────────────────────────────────────────────
const ALLOWED = [
  'https://dentiqua.vercel.app',
  'https://gnmrvc.github.io',
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const ok = ALLOWED.some(o => o instanceof RegExp ? o.test(origin) : o === origin);
    cb(ok ? null : new Error(`CORS: ${origin} nicht erlaubt`), ok);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── System-Prompts ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Du bist DENTIQUA, ein präziser KI-Assistent für zahnmedizinische Fachkräfte, \
eingesetzt in der Zahnarztpraxis Dentelegance. Du unterstützt ZMPs (Zahnmedizinische \
Prophylaxeassistentinnen) während laufender Behandlungen – diskret, klinisch präzise und vertrauenswürdig.

Kontext:
- Du begleitest Parodontitis-Behandlungen (PAR-Therapie, UPT, Recalls).
- Du kennst die relevanten Fachbegriffe: Sondierungstiefe, BOP (Bleeding on Probing), \
Furkationsbefund, Zahnfleischrezession, Scaling, Root Planing, Kürettage, Mundhygieneinstruktion.
- Aktuelle Patientin: Kaya Merovci, UPT-Sitzung 3, bekannte Risikofaktoren: Diabetes Typ 2, Rauchen.

Kommunikationsregeln:
- Antworte immer auf Deutsch.
- Sei präzise und klinisch korrekt – du sprichst mit einer Fachkraft, nicht mit Laien.
- Halte Antworten kurz und handlungsorientiert (max. 3–4 Sätze, wenn nicht anders gefragt).
- Keine Floskeln, kein unnötiges Wiederholen der Frage.
- Bei Medikamenten: immer Wirkstoff + Handelsname + Relevanz für die Behandlung.
- Bei unklaren klinischen Befunden: weise auf Rücksprache mit dem Zahnarzt hin.
- Du darfst keine Diagnosen stellen, nur klinische Informationen und Protokoll-Unterstützung liefern.`;

const COMMAND_PROMPT = `Du bist DENTIQUA, KI-Assistentin in der Zahnarztpraxis Dentelegance.
Aktuelle Patientin: Kaya Merovci, UPT-Sitzung 3, Diabetes Typ 2, Rauchen.

Analysiere den Sprachbefehl und antworte AUSSCHLIESSLICH mit validem JSON (kein Markdown, kein Text davor/danach):

{
  "speech": "Was du laut sagst (kurz, max 2 Sätze, Deutsch)",
  "action": "navigate|par_entry|answer",
  "target": "patient|par|doku|abschluss" (nur bei action=navigate),
  "depths": [zahl,zahl,zahl] (nur bei action=par_entry, wenn 3 Zahlen genannt werden)
}

Regeln:
- Navigation: "Patient / Übersicht / zurück" → navigate/patient | "PAR / Befund / Parodontal" → navigate/par | "Doku / Dokumentation" → navigate/doku | "Abschluss / Zusammenfassung / Protokoll" → navigate/abschluss
- PAR-Eintrag: 3 Zahlen (z.B. "drei vier drei" oder "3 4 3") auf dem PAR-Screen → par_entry mit depths
- Alles andere → answer (beantworte klinisch präzise, max 3 Sätze)
- action ist immer einer der drei Werte: navigate, par_entry, answer
- Antworte NUR mit dem JSON-Objekt`;

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'DENTIQUA Backend', timestamp: new Date().toISOString() });
});

// ── POST /api/chat ────────────────────────────────────────────────
// Body: { message: string, history?: [{role, content}] }
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Kein Text übergeben.' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message.trim() },
      ],
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[/api/chat]', err.message);
    res.status(502).json({ error: 'Claude API nicht erreichbar.' });
  }
});

// ── POST /api/speak ───────────────────────────────────────────────
// Body: { text: string, voice_id?: string }
// Returns: audio/mpeg stream
app.post('/api/speak', async (req, res) => {
  const { text, voice_id } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Kein Text übergeben.' });
  }

  const vid = voice_id || VOICE_ID;

  try {
    const elRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${vid}`,
      {
        text: text.trim(),
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
      }
    );

    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', elRes.data.byteLength);
    res.send(Buffer.from(elRes.data));
  } catch (err) {
    const status = err.response?.status;
    console.error('[/api/speak]', status, err.message);
    res.status(502).json({ error: 'ElevenLabs TTS nicht erreichbar.' });
  }
});

// ── POST /api/transcribe ──────────────────────────────────────────
// Multipart: audio file im Feld "audio"
// Returns: { text: string }
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Keine Audiodatei übergeben (Feld: audio).' });
  }

  try {
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm',
    });
    form.append('model_id', 'scribe_v1');

    const elRes = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      form,
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          ...form.getHeaders(),
        },
      }
    );

    res.json({ text: elRes.data.text || '' });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data;
    console.error('[/api/transcribe]', status, detail || err.message);
    res.status(502).json({ error: 'ElevenLabs STT nicht erreichbar.' });
  }
});

// ── POST /api/command ─────────────────────────────────────────────
// Body: { text: string, page?: string }
// Returns: { speech, action, target?, depths? }
app.post('/api/command', async (req, res) => {
  const { text, page = 'patient' } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Kein Text übergeben.' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: COMMAND_PROMPT,
      messages: [{ role: 'user', content: `Aktuelle Seite: ${page}\nBefehl: ${text.trim()}` }],
    });

    let raw = response.content[0].text.trim();
    // Strip markdown code fences if present
    raw = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { speech: raw, action: 'answer' };
    }

    res.json(parsed);
  } catch (err) {
    console.error('[/api/command]', err.message);
    res.status(502).json({ error: 'Claude API nicht erreichbar.' });
  }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint nicht gefunden.' }));

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DENTIQUA Backend läuft auf http://localhost:${PORT}`);
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ ANTHROPIC_API_KEY fehlt'}`);
  console.log(`  ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? '✓' : '✗ ELEVENLABS_API_KEY fehlt'}`);
});
