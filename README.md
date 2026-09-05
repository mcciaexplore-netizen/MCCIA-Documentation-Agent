# Shruti

Shruti is a local, Google Gemini-powered multilingual documentation agent that turns Hindi, English, Marathi, and code-mixed recordings into grounded professional documents.

## Current MVP

- Audio upload for Gemini-supported formats including MP3, M4A, WAV, WebM, OGG, FLAC, AAC, AIFF, and Opus
- In-browser microphone recording with a live timer and playback preview
- Timestamped speaker diarization
- Automatic long-audio mode for recordings over 30 minutes
- Optional OpenAI Whisper transcription fallback for small recordings
- Editable transcript review gate
- Meeting minutes, reports, summaries, and template filling
- English, Hindi, or Marathi document output
- Markdown copy and download
- Server-side Gemini API key; audio is relayed in small resumable chunks to Gemini and is not saved locally
- Temporary Gemini Files API uploads are deleted immediately after transcription
- Large recordings bypass Vercel's function request-body limit

## Run locally

1. Copy `.env.example` to `.env`.
2. Add your Google Gemini API key to `.env`.
3. Start the server:

   ```powershell
   npm start
   ```

4. Open `http://localhost:3000`.

To record directly, choose **Start recording** and allow microphone access for `localhost`. Stop and preview the recording before sending it for transcription. The recording stays in browser memory until **Transcribe recording** is selected; the server does not save it to disk.

No package installation is required. Node.js 20 or newer provides the server, `fetch`, `FormData`, and test runner used by the app.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | required | Google Gemini API authentication |
| `OPENAI_API_KEY` | optional | Enables the Whisper fallback for files up to 4 MB |
| `TRANSCRIPTION_MODEL` | `gemini-3.5-transcribe` | Speaker-aware transcription with timestamps |
| `LONG_AUDIO_MODEL` | `gemini-3.8-flash` | Full transcription of recordings longer than 30 minutes |
| `WHISPER_MODEL` | `whisper-1` | OpenAI Whisper transcription fallback |
| `DOCUMENT_MODEL` | `gemini-3.8-flash` | Document generation |
| `PORT` | `3000` | Local server port |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Maximum audio size accepted when creating a direct Gemini upload session |

Recordings up to 30 minutes use the dedicated transcription model with precise diarization and word timestamps. Longer recordings automatically use Gemini's long-audio understanding mode with timestamped speaker turns; timestamps and speaker separation are approximate in this mode.

## Verify

```powershell
npm test
```

The app intentionally marks audio quality conservatively because text-only transcript output cannot provide a reliable acoustic quality score. Missing information is surfaced rather than inferred.
