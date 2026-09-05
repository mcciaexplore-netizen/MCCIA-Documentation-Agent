export function formatTimestamp(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function normalizeTranscription(payload = {}) {
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const speakerMap = new Map();

  const segments = rawSegments
    .filter((segment) => segment && typeof segment.text === "string")
    .map((segment) => {
      const sourceSpeaker = String(segment.speaker || "unknown");
      if (!speakerMap.has(sourceSpeaker)) {
        speakerMap.set(sourceSpeaker, `Speaker ${speakerMap.size + 1}`);
      }

      return {
        start: Number(segment.start) || 0,
        end: Number(segment.end) || Number(segment.start) || 0,
        speaker: speakerMap.get(sourceSpeaker),
        sourceSpeaker,
        text: segment.text.trim(),
      };
    })
    .filter((segment) => segment.text);

  const text = segments.length
    ? segments
        .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.speaker}: ${segment.text}`)
        .join("\n")
    : String(payload.text || "").trim();

  const duration = Number(payload.duration)
    || segments.reduce((maximum, segment) => Math.max(maximum, segment.end), 0);

  return {
    text,
    plainText: String(payload.text || segments.map((segment) => segment.text).join(" ")).trim(),
    segments,
    duration,
    durationLabel: formatTimestamp(duration),
    speakerCount: speakerMap.size || (text ? 1 : 0),
    speakers: [...speakerMap.values()],
  };
}

function secondsFromOffset(offset) {
  if (typeof offset === "number") return offset;
  const match = String(offset || "").match(/^([\d.]+)s$/);
  return match ? Number(match[1]) : 0;
}

function joinWords(words) {
  return words
    .map((word) => String(word.word || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .trim();
}

export function normalizeGeminiTranscription(payload = {}) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const segments = [];
  const textFragments = [];
  const languages = new Set();

  for (const candidate of candidates) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === "string" && part.text.trim()) textFragments.push(part.text.trim());
      const transcription = part?.audioTranscription;
      if (!transcription) continue;

      const language = transcription.languageCode || transcription.language;
      if (language) languages.add(language);
      const words = Array.isArray(transcription.words) ? transcription.words : [];
      if (!words.length) continue;

      const text = joinWords(words);
      if (!text) continue;
      segments.push({
        start: secondsFromOffset(words[0]?.startOffset),
        end: secondsFromOffset(words.at(-1)?.endOffset),
        speaker: transcription.speakerLabel || "unknown",
        text,
      });
    }
  }

  const normalized = normalizeTranscription({
    text: textFragments.join("\n"),
    segments,
  });
  return {
    ...normalized,
    detectedLanguages: [...languages],
  };
}

export function extractResponseText(payload = {}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const fragments = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        fragments.push(content.text);
      }
    }
  }
  return fragments.join("\n").trim();
}

export function extractGeminiText(payload = {}) {
  const fragments = [];
  for (const candidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === "string") fragments.push(part.text);
    }
  }
  return fragments.join("\n").trim();
}

export function safeDownloadName(title = "document") {
  const cleaned = String(title)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  return `${cleaned || "document"}.md`;
}
