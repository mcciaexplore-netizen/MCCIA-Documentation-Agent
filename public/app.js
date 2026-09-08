import { upload, uploadPresigned } from "@vercel/blob/client";

const state = {
  file: null,
  transcription: null,
  document: "",
  recorder: null,
  mediaStream: null,
  recordingChunks: [],
  recordingStartedAt: 0,
  recordingTimer: null,
  recordingUrl: "",
  durationPromise: null,
  blobConfigured: false,
  blobUploadMode: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const uploadZone = $("#upload-zone");
const fileInput = $("#audio-file");
const transcribeButton = $("#transcribe-button");
const generateButton = $("#generate-button");

function recordingMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

function recordingExtension(type) {
  return type.includes("mp4") ? "m4a" : "webm";
}

function formatRecordingTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (duration = 0) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => finish(audio.duration), { once: true });
    audio.addEventListener("error", () => finish(), { once: true });
    setTimeout(() => finish(), 8000);
    audio.src = url;
  });
}

function releaseMicrophone() {
  if (state.recordingTimer) clearInterval(state.recordingTimer);
  state.recordingTimer = null;
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
}

function discardRecording({ preserveFile = false } = {}) {
  if (state.recorder?.state === "recording") state.recorder.stop();
  releaseMicrophone();
  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
  state.recordingUrl = "";
  state.recorder = null;
  state.recordingChunks = [];
  $("#recording-preview").removeAttribute("src");
  $("#recording-result").classList.add("hidden");
  $("#recording-time").textContent = "00:00";
  $(".recorder").classList.remove("is-recording");
  $("#record-button").classList.remove("hidden");
  $("#stop-button").classList.add("hidden");
  if (!preserveFile && state.file?.name.startsWith("mccia-recording-")) {
    state.file = null;
    transcribeButton.disabled = true;
    uploadZone.classList.remove("has-file");
    $("#upload-title").textContent = "Drop a recording here";
    $("#upload-detail").textContent = "Click to choose MP3, M4A, WAV, WebM, OGG, or FLAC";
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast("Audio recording is not supported in this browser.", true);
    return;
  }

  if (state.recordingUrl) discardRecording();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = recordingMimeType();
    const recorderOptions = { audioBitsPerSecond: 48_000 };
    if (mimeType) recorderOptions.mimeType = mimeType;
    const recorder = new MediaRecorder(stream, recorderOptions);
    state.mediaStream = stream;
    state.recorder = recorder;
    state.recordingChunks = [];
    state.recordingStartedAt = Date.now();

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.recordingChunks.push(event.data);
    });
    recorder.addEventListener("stop", finishRecording, { once: true });
    recorder.start(1000);

    $(".recorder").classList.add("is-recording");
    $("#record-button").classList.add("hidden");
    $("#stop-button").classList.remove("hidden");
    $("#recording-result").classList.add("hidden");
    state.recordingTimer = setInterval(() => {
      $("#recording-time").textContent = formatRecordingTime(Date.now() - state.recordingStartedAt);
    }, 250);
  } catch (error) {
    releaseMicrophone();
    const denied = error.name === "NotAllowedError" || error.name === "SecurityError";
    toast(denied ? "Microphone access was not allowed. Enable it in your browser to record." : `Could not start recording: ${error.message}`, true);
  }
}

function stopRecording() {
  if (state.recorder?.state === "recording") state.recorder.stop();
}

function finishRecording() {
  const recorder = state.recorder;
  const elapsed = Date.now() - state.recordingStartedAt;
  releaseMicrophone();
  $(".recorder").classList.remove("is-recording");
  $("#record-button").classList.remove("hidden");
  $("#stop-button").classList.add("hidden");
  $("#recording-time").textContent = formatRecordingTime(elapsed);

  if (!state.recordingChunks.length) {
    toast("No audio was captured. Please try recording again.", true);
    return;
  }

  const type = recorder?.mimeType || "audio/webm";
  const blob = new Blob(state.recordingChunks, { type });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const file = new File([blob], `mccia-recording-${timestamp}.${recordingExtension(type)}`, { type });
  chooseFile(file, elapsed / 1000);

  state.recordingUrl = URL.createObjectURL(blob);
  $("#recording-preview").src = state.recordingUrl;
  $("#recording-result").classList.remove("hidden");
  toast("Recording ready. Preview it or send it for transcription.");
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function setBusy(active, title, detail) {
  if (active) {
    clearTimeout(toast.timer);
    $("#toast").classList.remove("show");
  }
  $("#busy-title").textContent = title || "Working carefully…";
  $("#busy-detail").textContent = detail || "This may take a moment.";
  $("#busy").classList.toggle("hidden", !active);
}

function goToStep(step) {
  $$(".panel").forEach((panel) => panel.classList.remove("active"));
  $$(".step").forEach((button, index) => {
    button.classList.toggle("active", index === step - 1);
    if (index <= step - 1) button.disabled = false;
  });
  $(`#step-${step}`).classList.add("active");
  $(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function chooseFile(file, knownDuration = 0) {
  if (!file) return;
  const supported = file.type.startsWith("audio/") || /\.(mp3|mpeg|mpga|m4a|wav|webm|ogg|flac|aac|aiff|opus)$/i.test(file.name);
  if (!supported) {
    toast("Please choose a supported audio file such as MP3, M4A, WAV, WebM, OGG, or FLAC.", true);
    return;
  }
  state.file = file;
  state.durationPromise = knownDuration > 0 ? Promise.resolve(knownDuration) : readAudioDuration(file);
  uploadZone.classList.add("has-file");
  $("#upload-title").textContent = file.name;
  $("#upload-detail").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to transcribe`;
  transcribeButton.disabled = false;
  const selectedFile = file;
  state.durationPromise.then((duration) => {
    if (state.file !== selectedFile || !duration) return;
    $("#upload-detail").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · ${formatRecordingTime(duration * 1000)} · Ready to transcribe`;
  });
}

function formValues() {
  return {
    documentType: $("input[name='document-type']:checked").value,
    outputLanguage: $("#output-language").value,
    customInstructions: $("#custom-instructions").value.trim(),
    template: $("#template").value.trim(),
    blankPolicy: $("input[name='blank-policy']:checked").value,
  };
}

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

async function uploadRecording(file) {
  if (!state.blobConfigured) {
    throw new Error("Large-file storage is not configured. Connect a private Vercel Blob store to this project, then redeploy.");
  }
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "") || "recording.webm";
  const uploadRecordingFile = state.blobUploadMode === "oidc" ? uploadPresigned : upload;
  const blob = await uploadRecordingFile(`recordings/${safeName}`, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/blob-token",
    multipart: file.size > 5 * 1024 * 1024,
    contentType: file.type || "application/octet-stream",
    onUploadProgress: ({ percentage }) => {
      setBusy(true, "Uploading securely…", `Sending directly to private storage · ${Math.round(percentage)}%`);
    },
  });
  return blob.url;
}

function renderMetadata(data) {
  const items = [
    ["Duration", data.durationLabel || "Unknown"],
    ["Speakers", data.speakerCount || "Unknown"],
    ["Languages", data.dominantLanguages || "Auto-detected"],
    ["Audio quality", data.audioQuality || "Not assessed"],
  ];
  $("#metadata").innerHTML = items.map(([label, value]) => `<div class="meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("#speaker-map").textContent = data.diarizationAvailable === false
    ? "Groq Whisper does not separate speakers yet. All speech is temporarily labelled Speaker 1; edit names where known. WhisperX diarization is planned for a later update."
    : data.speakers?.length
      ? `Detected labels: ${data.speakers.join(", ")}. Edit them directly in the transcript if you know the names.`
      : "Speaker labels were not available for this recording.";
}

async function transcribe() {
  if (!state.file) return;
  const values = formValues();
  if (values.documentType === "template" && !values.template) {
    toast("Paste a template before continuing.", true);
    $("#template").focus();
    return;
  }

  setBusy(true, "Preparing recording…", "Checking the file securely before transcription.");
  try {
    const durationSeconds = Number(await state.durationPromise) || 0;
    const blobUrl = await uploadRecording(state.file);
    const longRecording = durationSeconds > 30 * 60;
    setBusy(
      true,
      longRecording ? "Transcribing long recording…" : "Listening carefully…",
      longRecording
        ? "Preparing secure 15-minute chunks, then transcribing them with Groq Whisper."
        : "Preserving Hindi, Marathi, English, and mixed-language speech with Groq Whisper.",
    );
    const data = await request("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blobUrl, filename: state.file.name, mimeType: state.file.type, durationSeconds }),
    });
    state.transcription = data;
    $("#transcript").value = data.text;
    renderMetadata(data);
    if ($("#skip-review").checked) {
      const generated = await generate();
      if (!generated) goToStep(2);
    } else {
      goToStep(2);
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function generate() {
  if (!state.transcription) return;
  const transcript = $("#transcript").value.trim();
  if (!transcript) {
    toast("The transcript cannot be empty.", true);
    return;
  }

  setBusy(true, "Shaping the document…", "Tracing every decision and action back to the transcript.");
  try {
    const data = await request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formValues(),
        transcript,
        metadata: {
          ...state.transcription,
          filename: state.file?.name,
        },
      }),
    });
    state.document = data.document;
    $("#document-output").textContent = data.document;
    $("#document-model").textContent = `Generated with ${data.provider || "Groq"} · ${data.model}`;
    goToStep(3);
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  } finally {
    setBusy(false);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reset() {
  discardRecording({ preserveFile: true });
  state.file = null;
  state.transcription = null;
  state.document = "";
  state.durationPromise = null;
  fileInput.value = "";
  $("#transcript").value = "";
  $("#document-output").textContent = "";
  $("#upload-title").textContent = "Drop a recording here";
  $("#upload-detail").textContent = "Click to choose MP3, M4A, WAV, WebM, OGG, or FLAC";
  uploadZone.classList.remove("has-file");
  transcribeButton.disabled = true;
  goToStep(1);
}

async function checkHealth() {
  try {
    const data = await request("/api/health");
    state.blobConfigured = Boolean(data.blobConfigured);
    state.blobUploadMode = data.blobUploadMode || "";
    const element = $("#api-status");
    const fullyConfigured = Boolean(data.configured && data.blobConfigured);
    element.classList.toggle("ready", fullyConfigured);
    element.classList.toggle("error", !fullyConfigured);
    element.querySelector("span:last-child").textContent = !data.configured
      ? "Groq key needed"
      : !data.blobConfigured
        ? "Storage setup needed"
        : "Groq + storage ready";
  } catch {
    $("#api-status").classList.add("error");
    $("#api-status span:last-child").textContent = "Server unavailable";
  }
}

$$(`input[name="document-type"]`).forEach((input) => input.addEventListener("change", () => {
  $$(".type-card").forEach((card) => card.classList.toggle("selected", card.contains($("input[name='document-type']:checked"))));
  $("#template-area").classList.toggle("hidden", input.value !== "template" || !input.checked);
}));

fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((event) => uploadZone.addEventListener(event, (e) => { e.preventDefault(); uploadZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((event) => uploadZone.addEventListener(event, (e) => { e.preventDefault(); uploadZone.classList.remove("dragging"); }));
uploadZone.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));
$("#record-button").addEventListener("click", startRecording);
$("#stop-button").addEventListener("click", stopRecording);
$("#discard-recording").addEventListener("click", () => discardRecording());
transcribeButton.addEventListener("click", transcribe);
generateButton.addEventListener("click", generate);
$$(`[data-back]`).forEach((button) => button.addEventListener("click", () => goToStep(Number(button.dataset.back))));
$("#new-recording").addEventListener("click", reset);

$("#copy-button").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.document);
  toast("Document copied to clipboard.");
});

$("#download-button").addEventListener("click", () => {
  const type = $("input[name='document-type']:checked").value;
  const blob = new Blob([state.document], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `mccia-${type}-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$$(`[data-followup]`).forEach((button) => button.addEventListener("click", () => {
  const messages = {
    translate: "Choose Hindi, Marathi, or English under Document language, then generate again from the reviewed transcript.",
    executive: "Executive-version generation is queued for the next build slice.",
    email: "Attendee-email drafting is queued for the next build slice.",
  };
  toast(messages[button.dataset.followup]);
}));

checkHealth();
window.addEventListener("beforeunload", releaseMicrophone);
