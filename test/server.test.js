import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 31907;

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("is ready at")) {
        child.stdout.off("data", onData);
        resolve();
      }
    };
    const onExit = (code) => {
      if (code !== null && code !== 0) reject(new Error(`server.js exited early with code ${code}. Output:\n${output}`));
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", onExit);
    setTimeout(() => reject(new Error(`server.js did not report ready within 10s. Output so far:\n${output}`)), 10_000);
  });
}

test("server.js starts without crashing and serves /api/health", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
  });

  try {
    await waitForServerReady(child);
    const response = await fetch(`http://localhost:${PORT}/api/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.agent, "MCCIA Documentation Agent");
  } finally {
    child.kill();
  }
});
