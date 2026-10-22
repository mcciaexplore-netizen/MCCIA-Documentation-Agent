# MCCIA Documentation Agent

The MCCIA Documentation Agent is a multilingual documentation tool for the Mahratta Chamber of Commerce, Industries and Agriculture, using a local WhisperX service for transcription and Claude for document generation. It turns Hindi, English, Marathi, and code-mixed recordings into grounded Chamber documents.

## Current MVP

- Audio and video upload for MP3, M4A, WAV, WebM, OGG, FLAC, AAC, AIFF, Opus, MP4, MOV, and MKV
- In-browser microphone recording with a live timer and playback preview
- Local WhisperX transcription with segment timestamps and real speaker diarization
- Support for 30–90 minute recordings within the configured 200 MB upload limit
- Editable transcript review gate
- MCCIA committee minutes, policy and event reports, leadership briefs, and template filling
- English, Hindi, or Marathi document output
- Markdown copy and download
- Claude-powered generation for minutes, reports, summaries, and templates
- Fireflies meeting-link import with existing speaker names and sentence timestamps
- Direct PDF download with multilingual Hindi, Marathi, and English fonts
- One-click full-document translation into Hindi, Marathi, or English
- One-page executive versions that preserve decisions, owners, deadlines, and open questions
- Ready-to-send attendee email drafts grounded in the generated document
- Reversible document variants: return to the original after creating any follow-up version
- Large audio uploads go directly to private Vercel Blob storage, then are handed to the local transcription service; nothing is sent to a cloud transcription API
- Temporary private Blob uploads are deleted immediately after transcription
- Large recordings bypass Vercel's function request-body limit
- Optional accounts: sign up, sign in, and automatically save generated documents (with their source transcript) to a personal history you can reopen or delete later

## Run locally

1. Copy `.env.example` to `.env` and add your Claude API key.
2. Set up and start the local transcription service — see `transcribe-service/README.md` for the one-time setup (Python, ffmpeg, a Hugging Face token for diarization). It must be running before transcription works.
3. Run the build, then start the server:

   ```powershell
   npm install
   npm run build
   npm start
   ```

4. Open `http://localhost:3000`.

To record directly, choose **Start recording** and allow microphone access for `localhost`. Stop and preview the recording before sending it for transcription. The recording stays in browser memory until **Transcribe recording** is selected; the server does not save it to disk.

Node.js 20 or newer is required. Production also needs a private Vercel Blob store connected to the project. New Vercel projects use short-lived OIDC credentials automatically; `BLOB_READ_WRITE_TOKEN` remains available for legacy and local setups.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | required | Claude API authentication, used for document generation |
| `WHISPERX_SERVICE_URL` | `http://127.0.0.1:8001` | Address of the local WhisperX transcription service (see `transcribe-service/README.md`) |
| `WHISPERX_MODEL` | `large-v3` | Transcription model label shown in the UI; set to match the model the service actually runs |
| `FIREFLIES_API_KEY` | optional | Imports transcripts from Fireflies meeting links using the official GraphQL API |
| `BLOB_READ_WRITE_TOKEN` | optional legacy/local auth | Private client uploads outside Vercel's OIDC environment |
| `CLAUDE_DOCUMENT_MODEL` | `claude-sonnet-5-5` | Minutes and report generation model |
| `CLAUDE_FOLLOWUP_MODEL` | `claude-sonnet-5-5` | Model for translation, executive versions, and attendee-email drafts |
| `PORT` | `3000` | Local server port |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Maximum audio size accepted by private Blob upload |
| `DATABASE_URL` | optional | Postgres connection string (Neon, Vercel Postgres, Supabase, etc). Enables accounts, login, and saved document history; without it the app works exactly as before, just without accounts |

If Claude's rate limit is temporarily reached, minutes, reports,
summaries, and notes automatically use a local timestamp-grounded extractive mode.
It keeps the workflow available without sending the transcript to another provider
or inventing content. Exact template filling still waits for Claude because
it requires model-based section mapping.

Recordings are uploaded to private Vercel Blob storage, then handed as-is to the local WhisperX service, which decodes and transcribes them with its own `ffmpeg`. Temporary WhisperX service errors (408, 429, 5xx) are retried with exponential backoff. The source recording is deleted from Blob storage immediately after transcription.

WhisperX provides both timestamps and real speaker diarization (via pyannote), so the transcript uses actual `Speaker 1`, `Speaker 2`, ... labels grounded in who was actually speaking, not a single placeholder — see `transcribe-service/README.md` for the one-time setup, including the Hugging Face token diarization needs.

To enable Fireflies imports, copy an API key from **Fireflies > Integrations > Fireflies API**, add it to Vercel as `FIREFLIES_API_KEY`, and redeploy. The key remains server-side. The importer accepts Fireflies transcript links and requests only the meeting title, participants, speaker names, timestamps, and transcript sentences.

## Accounts and history

Add `DATABASE_URL` (a Postgres connection string from Neon, Vercel Postgres, Supabase, or any Postgres host) to enable accounts. Once set:

- The topbar shows **Sign in** and **Create account**. Sessions are stored server-side and tracked with a signed, HTTP-only cookie (`mccia_session`), so no token is ever exposed to client-side JavaScript.
- Passwords are hashed with Node's built-in `scrypt` and a per-user random salt; plaintext passwords are never stored.
- Every document you generate while signed in — minutes, reports, briefs, translations, executive versions, and attendee emails — is saved automatically, together with its source transcript, to your personal **History**.
- Open **History** from the topbar to reopen or delete any saved document. Deleting a document removes it permanently.
- Required tables (`users`, `sessions`, `documents`) are created automatically on first run; no manual migration step is needed.
- Without `DATABASE_URL`, the app behaves exactly as before: fully usable, with no accounts, login, or history UI shown.

## Verify

```powershell
npm test
```

The app intentionally marks audio quality conservatively because text-only transcript output cannot provide a reliable acoustic quality score. Missing information is surfaced rather than inferred.
