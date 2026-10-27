import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, Quality, WebMOutputFormat } from "mediabunny";

// Matches the server's ffmpeg target (mono, 32 kbps), so nothing useful for transcription is lost.
const TARGET_BITRATE = 32_000;
// Files already near the target bitrate gain little from re-encoding.
const MIN_WORTHWHILE_BITRATE = 64_000;

/**
 * Re-encodes a recording to mono Opus/WebM in the browser so far fewer bytes are uploaded.
 * Falls back to the original file whenever compression is unsupported, fails, or doesn't help.
 * @param {File} file
 * @param {number} durationSeconds
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<File>}
 */
export async function compressForUpload(file, durationSeconds, onProgress) {
  if (!window.AudioEncoder) return file;
  if (durationSeconds > 0 && (file.size * 8) / durationSeconds <= MIN_WORTHWHILE_BITRATE) return file;

  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { numberOfChannels: 1, codec: "opus", quality: new Quality({ bitrate: TARGET_BITRATE }), forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) return file;
    if (onProgress) conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "recording";
    return new File([buffer], `${baseName}.webm`, { type: "audio/webm" });
  } catch (error) {
    console.warn(`Browser compression skipped: ${error.message}`);
    return file;
  }
}
