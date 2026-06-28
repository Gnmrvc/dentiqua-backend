# DENTIQUA Backend

Node.js/Express API-Server für DENTIQUA — verbindet die Frontend-App mit Claude (Anthropic) und ElevenLabs.

## Endpoints

| Method | Pfad | Beschreibung |
|--------|------|--------------|
| `GET` | `/health` | Server-Status |
| `POST` | `/api/chat` | Text → Claude → Antwort |
| `POST` | `/api/speak` | Text → ElevenLabs TTS → Audio (mp3) |
| `POST` | `/api/transcribe` | Audio → ElevenLabs STT → Text |

---

## Setup

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env
# .env öffnen und API Keys eintragen

# 3. Server starten
npm run dev      # Entwicklung (nodemon)
npm start        # Produktion
```

---

## API-Referenz

### POST /api/chat

```json
// Request
{ "message": "Was ist BOP?", "history": [] }

// Response
{ "response": "BOP (Bleeding on Probing) bezeichnet..." }
```

`history` ist optional — Array von `{ role: "user"|"assistant", content: "..." }` für Gesprächskontext.

---

### POST /api/speak

```json
// Request
{ "text": "Bitte Sonde anreichen.", "voice_id": "optional-override" }

// Response: audio/mpeg (binär)
```

Der Audio-Stream kann direkt in ein `<audio>`-Element oder Web Audio API geladen werden:

```javascript
const res = await fetch('/api/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Guten Morgen.' })
});
const blob = await res.blob();
const url  = URL.createObjectURL(blob);
new Audio(url).play();
```

---

### POST /api/transcribe

Multipart-Form mit Feld `audio`:

```javascript
const form = new FormData();
form.append('audio', audioBlob, 'aufnahme.webm');

const res  = await fetch('/api/transcribe', { method: 'POST', body: form });
const data = await res.json();
console.log(data.text); // Transkription
```

Unterstützte Formate: `webm`, `mp3`, `wav`, `m4a`, `ogg` (bis 25 MB).

---

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|--------------|
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `ELEVENLABS_API_KEY` | ElevenLabs API Key |
| `ELEVENLABS_VOICE_ID` | Voice ID für TTS (Standard: Jessica) |
| `ELEVENLABS_MODEL` | ElevenLabs Modell (Standard: `eleven_multilingual_v2`) |
| `PORT` | Server-Port (Standard: `3001`) |

---

## CORS

Erlaubte Origins:
- `https://dentiqua.vercel.app`
- `https://gnmrvc.github.io`
- `localhost:*` (Entwicklung)

Weitere Origins in `server.js` → `ALLOWED`-Array ergänzen.

---

## Deployment

Der Server kann auf Railway, Render, Fly.io oder einem eigenen VPS betrieben werden. Umgebungsvariablen dort als Secrets hinterlegen.
