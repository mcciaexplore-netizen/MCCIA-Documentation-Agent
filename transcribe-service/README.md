# MCCIA WhisperX transcription service

A small local Python service that transcribes meeting recordings with
[WhisperX](https://github.com/m-bain/whisperX) and attaches real speaker
diarization (pyannote). `server.js` calls this service's HTTP API instead of
a cloud transcription provider, so transcription runs entirely on your own
machine with no per-minute API cost.

## Setup

1. Install [ffmpeg](https://ffmpeg.org/download.html) and make sure it's on
   your system `PATH` (WhisperX decodes audio with it).
2. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate   # Windows; use `source .venv/bin/activate` on macOS/Linux
   pip install -r requirements.txt
   ```

   For GPU acceleration, follow WhisperX's own install notes for a
   CUDA-matched `torch` build before installing `whisperx` — the plain
   `pip install torch` above gives you a CPU-only build, which still works,
   just slower.
3. **Diarization needs a Hugging Face token.** Create one at
   [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens),
   then accept the user agreement for both
   [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   and [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0).
   Set the token as `HF_TOKEN` before starting the service. Without it, the
   service still transcribes — it just labels everyone `Speaker 1`.
4. Start the service:

   ```bash
   set HF_TOKEN=your-huggingface-token      # Windows (cmd); use `export` on macOS/Linux/PowerShell `$env:`
   set WHISPERX_MODEL=large-v3              # optional, this is the default
   python app.py
   ```

   It listens on `http://127.0.0.1:8001` by default (override with `PORT`).

5. In the main project's `.env`, set `WHISPERX_SERVICE_URL` if you changed
   the port, and `WHISPERX_MODEL` to match step 4 if you changed the model.
   This service must be running before `/api/transcribe` in the main app
   will work.

## Performance notes

- A GPU makes a large difference — `large-v3` on CPU can take several times
  the recording's own length to transcribe a long meeting. Smaller models
  (`medium`, `small`) trade accuracy for speed if you're CPU-only.
- The first request after startup is slow while the model loads into memory;
  it's cached in-process after that.

## API

- `GET /health` → `{ ok, model, device, diarizationReady }`
- `POST /transcribe` — multipart form, field `audio` is the recording file.
  Returns `{ text, segments: [{ start, end, speaker, text }], language }`.
