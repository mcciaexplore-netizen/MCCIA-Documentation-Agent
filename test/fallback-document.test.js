import assert from "node:assert/strict";
import test from "node:test";
import { createQuotaFallbackDocument } from "../lib/fallback-document.js";

const transcript = `[00:00:01] Priya: We need to share the revised proposal with the member companies by tomorrow.
[00:00:08] Aarav: The estimated attendance is 120 people.
[00:00:14] Priya: Is the venue available next week?
[00:00:20] Aarav: We agreed to review the compliance requirements this week.`;

test("quota fallback minutes remain traceable to timestamped statements", () => {
  const document = createQuotaFallbackDocument({
    documentType: "minutes",
    transcript,
    metadata: { filename: "member-meeting.m4a", durationLabel: "00:01:00", dominantLanguages: "English" },
  });
  assert.match(document, /MCCIA MEETING MINUTES/);
  assert.match(document, /Priya, Aarav/);
  assert.match(document, /\[00:00:01\] Priya/);
  assert.match(document, /tomorrow/);
  assert.doesNotMatch(document, /by explaining/);
  assert.doesNotMatch(document, /John|Pune/);
});

test("quota fallback omits call setup chatter from agenda and open questions", () => {
  const document = createQuotaFallbackDocument({
    documentType: "minutes",
    transcript: `[00:00:01] MCCIA: Can you hear us?\n[00:00:05] MCCIA: We need to review the customer data report.`,
    metadata: { filename: "consultation.fireflies.json" },
  });
  assert.doesNotMatch(document, /AGENDA \/ TOPICS DISCUSSED\n- \[00:00:01\]/);
  assert.match(document, /MCCIA Meeting — consultation/);
  assert.doesNotMatch(document, /consultation\.fireflies/);
});

test("quota fallback report includes the exact full transcript", () => {
  const document = createQuotaFallbackDocument({ documentType: "report", transcript, metadata: {} });
  assert.match(document, /Appendix: Full Transcript/);
  assert.ok(document.endsWith(transcript));
});
