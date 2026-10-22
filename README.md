# MCCIA Documentation Agent

The MCCIA Documentation Agent is a Groq-powered multilingual documentation tool for the Mahratta Chamber of Commerce, Industries and Agriculture, using Groq Whisper for transcription and Claude for document generation. It turns Hindi, English, Marathi, and code-mixed recordings into grounded Chamber documents.

## Current MVP

- Audio and video upload for MP3, M4A, WAV, WebM, OGG, FLAC, AAC, AIFF, Opus, MP4, MOV, and MKV
- In-browser microphone recording with a live timer and playback preview
- Groq Whisper Large V3 Turbo transcription with segment timestamps
- Automatic conversion into compact 15-minute MP3 chunks below Groq's 25 MB free-plan limit
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
- Large audio uploads go directly to private Supabase Storage from the browser, bypassing Vercel's function request-body limit
- Private recordings are converted and sent to Groq as valid audio chunks
- Temporary private Storage uploads are deleted immediately after transcription
- Optional accounts: sign up, sign in, and automatically save generated documents (with their source transcript) to a personal history you can reopen or delete later, backed by Supabase Postgres

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your Groq and Claude API keys, and a Supabase project's URL/keys, to `.env`.
3. Run the build, then start the server:

   ```powershell
   npm install
   npm run build
   npm start
   ```

4. Open `http://localhost:3000`.

To record directly, choose **Start recording** and allow microphone access for `localhost`. Stop and preview the recording before sending it for transcription. The recording stays in browser memory until **Transcribe recording** is selected; the server does not save it to disk.

Node.js 20 or newer is required. Production also needs a Supabase project with a private Storage bucket connected (see "Supabase Storage setup" below).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | required | Groq API authentication, used for audio transcription |
| `ANTHROPIC_API_KEY` | required | Claude API authentication, used for document generation |
| `ANTHROPIC_WORKSPACE_ID` | optional | Required only if `ANTHROPIC_API_KEY` is an organization-level key not scoped to a workspace |
| `SUPABASE_URL` | required | Your Supabase project URL; safe to expose to the browser |
| `SUPABASE_ANON_KEY` | required | Supabase anon/public key; safe to expose to the browser, used only to perform pre-authorized uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Supabase service role key; server-side only, has full admin access to Storage |
| `SUPABASE_STORAGE_BUCKET` | `recordings` | Private Storage bucket that holds recordings during transcription |
| `FIREFLIES_API_KEY` | optional | Imports transcripts from Fireflies meeting links using the official GraphQL API |
| `GROQ_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | Multilingual transcription model |
| `CLAUDE_DOCUMENT_MODEL` | `claude-sonnet-5-5` | Minutes and report generation model |
| `CLAUDE_FOLLOWUP_MODEL` | `claude-sonnet-5-5` | Model for translation, executive versions, and attendee-email drafts |
| `GROQ_CHUNK_MINUTES` | `15` | Length of each compressed transcription chunk (5–20 minutes) |
| `GROQ_CHUNK_CONCURRENCY` | `2` | Parallel Groq transcription requests (1–4) |
| `PORT` | `3000` | Local server port |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Maximum audio size accepted by Storage upload and Groq processing |
| `DATABASE_URL` | optional | Supabase (or any) Postgres connection string. Enables accounts, login, and saved document history; without it the app works exactly as before, just without accounts |

## Supabase Storage setup

Audio recordings are uploaded directly from the browser to a private Supabase Storage bucket, then downloaded server-side for transcription and deleted immediately after. To set this up:

1. Create a project at [supabase.com](https://supabase.com) (free tier works).
2. In the dashboard, go to **Storage** and create a new bucket named `recordings` (or any name — set `SUPABASE_STORAGE_BUCKET` to match). Leave it **private** (not public).
3. In the bucket's **Configuration**, set a file size limit matching `MAX_AUDIO_UPLOAD_MB` (default 200 MB) — the signed-upload API itself does not enforce a size cap, so this is the real limit.
4. Go to **Settings > API** and copy the **Project URL** (`SUPABASE_URL`), **anon public** key (`SUPABASE_ANON_KEY`), and **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) into `.env`. The service role key must never be exposed to the browser — only the server reads it.

If Claude's rate limit is temporarily reached, minutes, reports,
summaries, and notes automatically use a local timestamp-grounded extractive mode.
It keeps the workflow available without sending the transcript to another provider
or inventing content. Exact template filling still waits for Claude because
it requires model-based section mapping.

Every recording is converted server-side to 16 kHz mono MP3 and divided into 15-minute chunks. At 32 kbps these chunks are normally about 3.6 MB each, comfortably below Groq's 25 MB free-plan limit. Temporary Groq 408, 429, and 5xx errors are retried with exponential backoff. Source recordings and converted chunks are deleted immediately after processing.

Groq Whisper provides timestamps but not speaker diarization. The transcript uses `Speaker 1` and users can correct speaker names during the review step.

To enable Fireflies imports, copy an API key from **Fireflies > Integrations > Fireflies API**, add it to Vercel as `FIREFLIES_API_KEY`, and redeploy. The key remains server-side. The importer accepts Fireflies transcript links and requests only the meeting title, participants, speaker names, timestamps, and transcript sentences.

## Accounts and history

Add `DATABASE_URL` (your Supabase project's Postgres connection string, or any other Postgres host) to enable accounts. Once set:

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
