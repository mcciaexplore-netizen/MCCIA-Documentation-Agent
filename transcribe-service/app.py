import os
import tempfile

from flask import Flask, jsonify, request

import torch
import whisperx

app = Flask(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
MODEL_SIZE = os.environ.get("WHISPERX_MODEL", "large-v3")
HF_TOKEN = os.environ.get("HF_TOKEN")

_whisper_model = None
_diarize_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = whisperx.load_model(MODEL_SIZE, DEVICE, compute_type=COMPUTE_TYPE)
    return _whisper_model


def get_diarize_model():
    global _diarize_model
    if _diarize_model is None:
        if not HF_TOKEN:
            raise RuntimeError("HF_TOKEN is not set")
        _diarize_model = whisperx.diarize.DiarizationPipeline(use_auth_token=HF_TOKEN, device=DEVICE)
    return _diarize_model


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "model": MODEL_SIZE,
        "device": DEVICE,
        "diarizationReady": bool(HF_TOKEN),
    })


@app.post("/transcribe")
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "Send the recording as multipart field 'audio'."}), 400

    upload = request.files["audio"]
    suffix = os.path.splitext(upload.filename or "audio")[1] or ".audio"
    handle = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    audio_path = handle.name
    handle.close()
    upload.save(audio_path)

    try:
        audio = whisperx.load_audio(audio_path)
        model = get_whisper_model()
        result = model.transcribe(audio, batch_size=16)
        language = result.get("language")

        align_model, metadata = whisperx.load_align_model(language_code=language, device=DEVICE)
        result = whisperx.align(result["segments"], align_model, metadata, audio, DEVICE, return_char_alignments=False)

        try:
            diarize_model = get_diarize_model()
            diarize_segments = diarize_model(audio)
            result = whisperx.assign_word_speakers(diarize_segments, result)
        except RuntimeError:
            # No HF_TOKEN configured for the gated pyannote diarization model:
            # fall back to a single speaker instead of failing the whole request.
            for segment in result["segments"]:
                segment.setdefault("speaker", "SPEAKER_00")

        segments = [
            {
                "start": segment.get("start", 0),
                "end": segment.get("end", segment.get("start", 0)),
                "speaker": segment.get("speaker", "SPEAKER_00"),
                "text": (segment.get("text") or "").strip(),
            }
            for segment in result["segments"]
            if (segment.get("text") or "").strip()
        ]

        return jsonify({
            "text": " ".join(segment["text"] for segment in segments),
            "segments": segments,
            "language": language,
        })
    finally:
        try:
            os.remove(audio_path)
        except OSError:
            pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    app.run(host="127.0.0.1", port=port)
