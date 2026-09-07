# MCCIA Documentation Agent

The MCCIA Documentation Agent is a Google Gemini-powered multilingual documentation tool for the Mahratta Chamber of Commerce, Industries and Agriculture. It turns Hindi, English, Marathi, and code-mixed recordings into grounded Chamber documents.

## Current MVP

- Audio upload for Gemini-supported formats including MP3, M4A, WAV, WebM, OGG, FLAC, AAC, AIFF, and Opus
- In-browser microphone recording with a live timer and playback preview
- Timestamped speaker diarization
- Automatic long-audio mode for recordings over 30 minutes
- Optional OpenAI Whisper transcription fallback for small recordings
- Editable transcript review gate
- MCCIA committee minutes, policy and event reports, leadership briefs, and template filling
- English, Hindi, or Marathi document output
- Markdown copy and download
- Server-side Gemini API key; large audio uploads go directly to private Vercel Blob storage
- Private recordings are streamed to Gemini in supported 8 MiB resumable chunks
- Temporary Gemini Files API uploads are deleted immediately after transcription
- Temporary private Blob uploads are deleted immediately after transcription
- Large recordings bypass Vercel's function request-body limit

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your Google Gemini API key to `.env`.
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
| `GEMINI_API_KEY` | required | Google Gemini API authentication |
| `BLOB_READ_WRITE_TOKEN` | optional legacy/local auth | Private client uploads outside Vercel's OIDC environment |
| `OPENAI_API_KEY` | optional | Enables the Whisper fallback for files up to 4 MB |
| `TRANSCRIPTION_MODEL` | `gemini-3.5-transcribe` | Speaker-aware transcription with timestamps |
| `LONG_AUDIO_MODEL` | `gemini-3.8-flash` | Full transcription of recordings longer than 30 minutes |
| `LONG_AUDIO_FALLBACK_MODELS` | `gemini-3.7-flash,gemini-2.5-flash` | Backup models used after automatic retries for temporary Gemini capacity errors |
| `WHISPER_MODEL` | `whisper-1` | OpenAI Whisper transcription fallback |
| `DOCUMENT_MODEL` | `gemini-3.8-flash` | Document generation |
| `PORT` | `3000` | Local server port |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Maximum audio size accepted by private Blob upload and Gemini processing |

Recordings up to 30 minutes use the dedicated transcription model with precise diarization and word timestamps. Longer recordings automatically use Gemini's long-audio understanding mode with timestamped speaker turns; timestamps and speaker separation are approximate in this mode. Temporary Gemini 408, 429, and 5xx errors are retried with exponential backoff. If the primary long-audio model remains busy, the configured backup models are tried automatically.

## Verify

```powershell
npm test
```

The app intentionally marks audio quality conservatively because text-only transcript output cannot provide a reliable acoustic quality score. Missing information is surfaced rather than inferred.
