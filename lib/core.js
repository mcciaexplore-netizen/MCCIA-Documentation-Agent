export function formatTimestamp(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function splitTranscriptForModel(value, maximumCharacters = 22_000) {
  const text = String(value || "").trim();
  const limit = Math.max(2_000, Number(maximumCharacters) || 22_000);
  if (!text) return [];

  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const minimumBoundary = Math.floor(limit * 0.6);
    const candidate = remaining.slice(0, limit + 1);
    const lineBoundary = candidate.lastIndexOf("\n");
    const wordBoundary = candidate.lastIndexOf(" ");
    const boundary = lineBoundary >= minimumBoundary
      ? lineBoundary
      : wordBoundary >= minimumBoundary
        ? wordBoundary
        : limit;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
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

export function combineGroqTranscriptions(results = [], chunkSeconds = 15 * 60, knownDuration = 0) {
  const segments = [];
  const languages = new Set();
  const plainTextParts = [];

  results.forEach((payload, index) => {
    const offset = index * chunkSeconds;
    if (payload?.language) languages.add(String(payload.language));
    if (typeof payload?.text === "string" && payload.text.trim()) plainTextParts.push(payload.text.trim());

    const sourceSegments = Array.isArray(payload?.segments) && payload.segments.length
      ? payload.segments
      : (payload?.text ? [{ start: 0, end: Number(payload.duration) || 0, text: payload.text }] : []);

    for (const segment of sourceSegments) {
      const text = String(segment?.text || "").trim();
      if (!text) continue;
      segments.push({
        start: offset + (Number(segment.start) || 0),
        end: offset + (Number(segment.end) || Number(segment.start) || 0),
        speaker: "Speaker 1",
        sourceSpeaker: "unknown",
        text,
      });
    }
  });

  const duration = Number(knownDuration)
    || segments.reduce((maximum, segment) => Math.max(maximum, segment.end), 0);
  const text = segments
    .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.speaker}: ${segment.text}`)
    .join("\n");

  return {
    text: text || plainTextParts.join("\n"),
    plainText: plainTextParts.join(" ").trim(),
    segments,
    duration,
    durationLabel: formatTimestamp(duration),
    speakerCount: text || plainTextParts.length ? 1 : 0,
    speakers: text || plainTextParts.length ? ["Speaker 1"] : [],
    detectedLanguages: [...languages],
  };
}

export function firefliesTranscriptId(reference) {
  const value = String(reference || "").trim();
  if (/^[A-Za-z0-9_-]{6,200}$/.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || !/(^|\.)fireflies\.ai$/i.test(url.hostname)) return "";

  const queryId = ["transcriptId", "transcript_id", "meetingId", "meeting_id", "id"]
    .map((key) => url.searchParams.get(key))
    .find(Boolean);
  if (queryId && /^[A-Za-z0-9_-]{6,200}$/.test(queryId)) return queryId;

  const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  const finalSegment = segments.at(-1) || "";
  const doubleColonId = finalSegment.includes("::") ? finalSegment.slice(finalSegment.lastIndexOf("::") + 2) : "";
  if (/^[A-Za-z0-9_-]{6,200}$/.test(doubleColonId)) return doubleColonId;
  if (/^[A-Za-z0-9_-]{6,200}$/.test(finalSegment) && segments.some((segment) => /^(view|transcript)$/i.test(segment))) {
    return finalSegment;
  }
  return "";
}

function firefliesSeconds(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, numeric);
  const timestamp = String(value || "").match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (!timestamp) return 0;
  return (Number(timestamp[1] || 0) * 3600) + (Number(timestamp[2]) * 60) + Number(timestamp[3]);
}

export function normalizeFirefliesTranscript(transcript = {}) {
  const segments = (Array.isArray(transcript.sentences) ? transcript.sentences : [])
    .filter((sentence) => sentence && (sentence.text || sentence.raw_text))
    .sort((left, right) => (Number(left.index) || 0) - (Number(right.index) || 0))
    .map((sentence) => ({
      start: firefliesSeconds(sentence.start_time),
      end: firefliesSeconds(sentence.end_time),
      speaker: String(sentence.speaker_name || (sentence.speaker_id ? `Speaker ${sentence.speaker_id}` : "a speaker")),
      sourceSpeaker: String(sentence.speaker_id || sentence.speaker_name || "unknown"),
      text: String(sentence.text || sentence.raw_text).trim(),
    }))
    .filter((segment) => segment.text);
  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  const duration = segments.reduce((maximum, segment) => Math.max(maximum, segment.end), 0);
  return {
    text: segments.map((segment) => `[${formatTimestamp(segment.start)}] ${segment.speaker}: ${segment.text}`).join("\n"),
    plainText: segments.map((segment) => segment.text).join(" "),
    segments,
    duration,
    durationLabel: formatTimestamp(duration),
    speakerCount: speakers.length,
    speakers,
    title: String(transcript.title || "Fireflies meeting"),
    participants: Array.isArray(transcript.participants) ? transcript.participants : [],
    meetingDate: transcript.date || transcript.dateString || "",
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

function timestampToSeconds(timestamp) {
  const parts = String(timestamp).split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

export function normalizeLongAudioTranscript(text, duration = 0) {
  const cleaned = String(text || "")
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const speakers = [];
  const segments = [];
  const linePattern = /^\[(\d{2}:\d{2}:\d{2})\]\s*(Speaker\s+\d+|a speaker)\s*:\s*(.+)$/i;

  for (const line of cleaned.split(/\r?\n/)) {
    const match = line.trim().match(linePattern);
    if (!match) continue;
    const speaker = match[2].replace(/^speaker/i, "Speaker");
    if (!speakers.includes(speaker)) speakers.push(speaker);
    segments.push({
      start: timestampToSeconds(match[1]),
      end: timestampToSeconds(match[1]),
      speaker,
      sourceSpeaker: speaker,
      text: match[3].trim(),
    });
  }

  return {
    text: cleaned,
    plainText: segments.length ? segments.map((segment) => segment.text).join(" ") : cleaned,
    segments,
    duration: Number(duration) || 0,
    durationLabel: formatTimestamp(duration),
    speakerCount: speakers.length || (cleaned ? 1 : 0),
    speakers,
    detectedLanguages: [],
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
