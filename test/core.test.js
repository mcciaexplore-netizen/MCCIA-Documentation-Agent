import test from "node:test";
import assert from "node:assert/strict";
import { extractGeminiText, extractResponseText, formatTimestamp, normalizeGeminiTranscription, normalizeLongAudioTranscript, normalizeTranscription, safeDownloadName } from "../lib/core.js";

test("formatTimestamp produces full HH:MM:SS timestamps", () => {
  assert.equal(formatTimestamp(0), "00:00:00");
  assert.equal(formatTimestamp(3723.9), "01:02:03");
  assert.equal(formatTimestamp(-10), "00:00:00");
});

test("normalizeTranscription maps source speakers in first-seen order", () => {
  const result = normalizeTranscription({
    duration: 8.4,
    text: "नमस्ते. Q3 budget approve किया.",
    segments: [
      { start: 0.2, end: 2.1, speaker: "A", text: "नमस्ते." },
      { start: 2.4, end: 8.4, speaker: "B", text: "Q3 budget approve किया." },
    ],
  });

  assert.equal(result.speakerCount, 2);
  assert.deepEqual(result.speakers, ["Speaker 1", "Speaker 2"]);
  assert.match(result.text, /^\[00:00:00\] Speaker 1: नमस्ते\./);
  assert.match(result.text, /Speaker 2: Q3 budget approve किया\./);
  assert.equal(result.durationLabel, "00:00:08");
});

test("extractResponseText handles REST Responses API output", () => {
  assert.equal(extractResponseText({ output_text: "Direct" }), "Direct");
  assert.equal(extractResponseText({ output: [{ type: "message", content: [{ type: "output_text", text: "Nested" }] }] }), "Nested");
});

test("normalizeGeminiTranscription maps annotated speaker turns", () => {
  const result = normalizeGeminiTranscription({
    candidates: [{ content: { parts: [
      { audioTranscription: { speakerLabel: "spk_1", languageCode: "hi-IN", words: [
        { word: "नमस्ते", startOffset: "0.100s", endOffset: "0.500s" },
        { word: "Aarushi", startOffset: "0.600s", endOffset: "1.000s" },
      ] } },
      { audioTranscription: { speakerLabel: "spk_2", languageCode: "en-IN", words: [
        { word: "Hello", startOffset: "1.200s", endOffset: "1.600s" },
        { word: ".", startOffset: "1.600s", endOffset: "1.700s" },
      ] } },
    ] } }],
  });

  assert.equal(result.speakerCount, 2);
  assert.match(result.text, /Speaker 1: नमस्ते Aarushi/);
  assert.match(result.text, /Speaker 2: Hello\./);
  assert.deepEqual(result.detectedLanguages, ["hi-IN", "en-IN"]);
});

test("extractGeminiText joins model text parts", () => {
  assert.equal(extractGeminiText({ candidates: [{ content: { parts: [{ text: "One" }, { text: "Two" }] } }] }), "One\nTwo");
});

test("normalizeLongAudioTranscript preserves timestamped speaker turns", () => {
  const result = normalizeLongAudioTranscript("[00:00:03] Speaker 1: नमस्ते Aarushi\n[01:02:04] Speaker 2: Q3 budget approve किया.", 5400);
  assert.equal(result.durationLabel, "01:30:00");
  assert.equal(result.speakerCount, 2);
  assert.equal(result.segments[1].start, 3724);
  assert.match(result.plainText, /Q3 budget approve किया/);
});

test("safeDownloadName removes unsafe filename characters", () => {
  assert.equal(safeDownloadName("Meeting: Pune / Q3"), "meeting-pune-q3.md");
});
