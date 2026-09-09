# MCCIA Documentation Agent

The MCCIA Documentation Agent is a Groq-powered multilingual documentation tool for the Mahratta Chamber of Commerce, Industries and Agriculture. It turns Hindi, English, Marathi, and code-mixed recordings into grounded Chamber documents.

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
- Groq Compound Mini generation for minutes, reports, summaries, and templates
- Fireflies meeting-link import with existing speaker names and sentence timestamps
- Direct PDF download with multilingual Hindi, Marathi, and English fonts
- Server-side Groq API key; large audio uploads go directly to private Vercel Blob storage
- Private recordings are converted and sent to Groq as valid audio chunks
- Temporary private Blob uploads are deleted immediately after transcription
- Large recordings bypass Vercel's function request-body limit

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your Groq API key to `.env`.
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
| `GROQ_API_KEY` | required | Groq API authentication |
| `FIREFLIES_API_KEY` | optional | Imports transcripts from Fireflies meeting links using the official GraphQL API |
| `BLOB_READ_WRITE_TOKEN` | optional legacy/local auth | Private client uploads outside Vercel's OIDC environment |
| `GROQ_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | Multilingual transcription model |
| `GROQ_DOCUMENT_MODEL` | `groq/compound-mini` | Minutes and report generation model |
| `GROQ_CHUNK_MINUTES` | `15` | Length of each compressed transcription chunk (5–20 minutes) |
| `GROQ_CHUNK_CONCURRENCY` | `2` | Parallel Groq transcription requests (1–4) |
| `PORT` | `3000` | Local server port |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Maximum audio size accepted by private Blob upload and Groq processing |

Every recording is converted server-side to 16 kHz mono MP3 and divided into 15-minute chunks. At 32 kbps these chunks are normally about 3.6 MB each, comfortably below Groq's 25 MB free-plan limit. Temporary Groq 408, 429, and 5xx errors are retried with exponential backoff. Source recordings and converted chunks are deleted immediately after processing.

Groq Whisper provides timestamps but not speaker diarization. Until WhisperX is connected, the transcript uses `Speaker 1` and users can correct speaker names during the review step. A future `WhisperX + pyannote` service can be added without changing the document-generation workflow.

To enable Fireflies imports, copy an API key from **Fireflies > Integrations > Fireflies API**, add it to Vercel as `FIREFLIES_API_KEY`, and redeploy. The key remains server-side. The importer accepts Fireflies transcript links and requests only the meeting title, participants, speaker names, timestamps, and transcript sentences.

## Verify

```powershell
npm test
```

The app intentionally marks audio quality conservatively because text-only transcript output cannot provide a reliable acoustic quality score. Missing information is surfaced rather than inferred.
