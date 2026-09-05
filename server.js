import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractGeminiText, normalizeGeminiTranscription } from "./lib/core.js";
import { AGENT_NAME, buildDocumentRequest, SYSTEM_PROMPT } from "./lib/prompts.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");

await loadLocalEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || "gemini-3.5-transcribe";
const DOCUMENT_MODEL = process.env.DOCUMENT_MODEL || "gemini-3.8-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error(`Request exceeds the ${Math.round(limit / 1024 / 1024)} MB limit.`);
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requireApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("GEMINI_API_KEY is not configured. Copy .env.example to .env and add your key.");
    error.status = 503;
    throw error;
  }
  return process.env.GEMINI_API_KEY;
}

async function geminiRequest(url, options = {}) {
  const apiKey = requireApiKey();
  const response = await fetch(url, {
    ...options,
    headers: {
      "x-goog-api-key": apiKey,
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function uploadGeminiFile(audio, mimeType, filename) {
  const apiKey = requireApiKey();
  const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audio.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: filename } }),
  });

  if (!startResponse.ok) {
    const payload = await startResponse.json().catch(() => ({}));
    const error = new Error(payload?.error?.message || `Gemini upload initialization failed (${startResponse.status}).`);
    error.status = startResponse.status;
    throw error;
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return a resumable upload URL.");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(audio.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: audio,
  });
  const payload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    const error = new Error(payload?.error?.message || `Gemini audio upload failed (${uploadResponse.status}).`);
    error.status = uploadResponse.status;
    throw error;
  }
  return waitForGeminiFile(payload.file);
}

async function waitForGeminiFile(file) {
  if (!file?.name) throw new Error("Gemini returned incomplete file metadata.");
  let current = file;
  const deadline = Date.now() + 45_000;

  while (current.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    current = await geminiRequest(`${GEMINI_API_BASE}/${current.name}`);
  }

  if (current.state === "FAILED") throw new Error("Gemini could not process the uploaded recording.");
  if (current.state === "PROCESSING") throw new Error("Gemini is still processing the recording. Please try again.");
  return current;
}

async function deleteGeminiFile(file) {
  if (!file?.name) return;
  try {
    await geminiRequest(`${GEMINI_API_BASE}/${file.name}`, { method: "DELETE" });
  } catch (error) {
    console.warn(`Could not delete temporary Gemini file ${file.name}: ${error.message}`);
  }
}

async function generateWithGemini(model, body) {
  return geminiRequest(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function transcribe(request, response) {
  const mimeType = String(request.headers["content-type"] || "application/octet-stream").split(";")[0];
  const encodedName = String(request.headers["x-file-name"] || "recording.webm");
  let filename = "recording.webm";
  try {
    filename = path.basename(decodeURIComponent(encodedName));
  } catch {
    filename = path.basename(encodedName);
  }

  const audio = await readBody(request, MAX_UPLOAD_BYTES);
  if (!audio.length) {
    const error = new Error("The uploaded audio file is empty.");
    error.status = 400;
    throw error;
  }

  let uploadedFile;
  let raw;
  try {
    uploadedFile = await uploadGeminiFile(audio, mimeType, filename);
    raw = await generateWithGemini(TRANSCRIPTION_MODEL, {
      contents: [{
        role: "user",
        parts: [{
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: uploadedFile.mimeType || mimeType,
          },
        }],
      }],
      generationConfig: {
        audioTranscriptionConfig: {
          languageCodes: [],
          diarization: true,
          wordTimestamp: true,
          mode: "VERBATIM",
        },
      },
    });
  } finally {
    if (uploadedFile) await deleteGeminiFile(uploadedFile);
  }

  const normalized = normalizeGeminiTranscription(raw);
  if (!normalized.text) throw new Error("Gemini returned an empty transcript.");
  const dominantLanguages = normalized.detectedLanguages.length
    ? normalized.detectedLanguages.join(", ")
    : "Auto-detected by Gemini";

  sendJson(response, 200, {
    ...normalized,
    filename,
    dominantLanguages,
    audioQuality: normalized.segments.length ? "Processable" : "Limited transcript detail",
    model: TRANSCRIPTION_MODEL,
    provider: "Google Gemini",
  });
}

async function generateDocument(request, response) {
  const buffer = await readBody(request, 1024 * 1024);
  let input;
  try {
    input = JSON.parse(buffer.toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON request.");
    error.status = 400;
    throw error;
  }

  if (!String(input.transcript || "").trim()) {
    const error = new Error("A transcript is required before generating a document.");
    error.status = 400;
    throw error;
  }

  const raw = await generateWithGemini(DOCUMENT_MODEL, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildDocumentRequest(input) }] }],
    generationConfig: { temperature: 0.2 },
  });

  const document = extractGeminiText(raw);
  if (!document) throw new Error("The model returned no document text.");
  sendJson(response, 200, { document, model: DOCUMENT_MODEL, provider: "Google Gemini" });
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") sendJson(response, 404, { error: "Not found" });
    else throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        configured: Boolean(process.env.GEMINI_API_KEY),
        agent: AGENT_NAME,
        provider: "Google Gemini",
        models: { transcription: TRANSCRIPTION_MODEL, document: DOCUMENT_MODEL },
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/transcribe") {
      await transcribe(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/generate") {
      await generateDocument(request, response);
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url.pathname);
      return;
    }
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, Number(error.status) || 500, { error: error.message || "Unexpected server error" });
  }
});

server.listen(PORT, () => {
  console.log(`${AGENT_NAME} is ready at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) console.log("Add GEMINI_API_KEY to .env to enable transcription and document generation.");
});

async function loadLocalEnv(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
