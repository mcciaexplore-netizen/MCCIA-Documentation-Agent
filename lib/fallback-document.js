const timestampedLine = /^\[(\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$/;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseTranscript(transcript) {
  const entries = [];
  for (const rawLine of String(transcript || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(timestampedLine);
    if (match) {
      entries.push({ timestamp: match[1], speaker: clean(match[2]), text: clean(match[3]) });
    } else if (entries.length) {
      entries.at(-1).text = clean(`${entries.at(-1).text} ${line}`);
    } else {
      entries.push({ timestamp: "timestamp unavailable", speaker: "a speaker", text: clean(line) });
    }
  }
  return entries.filter((entry) => entry.text);
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.text.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSubstantive(entry) {
  if (entry.text.length < 28) return false;
  if (/^(hello|hi|okay|ok|yes|no|thank you|thanks|good (morning|afternoon|evening|day))[.!? ]*$/i.test(entry.text)) return false;
  return !/\b(can you hear|am i audible|are we waiting|anyone else joining|has joined|we'll wait|just a minute|internet issue|screen visible|turn on my camera)\b/i.test(entry.text);
}

function spread(entries, limit) {
  const candidates = uniqueEntries(entries.filter(isSubstantive));
  if (candidates.length <= limit) return candidates;
  const picked = [];
  const used = new Set();
  for (let index = 0; index < limit; index += 1) {
    const selected = Math.round(index * (candidates.length - 1) / Math.max(1, limit - 1));
    if (!used.has(selected)) {
      used.add(selected);
      picked.push(candidates[selected]);
    }
  }
  return picked;
}

function matching(entries, pattern, limit = 12) {
  return uniqueEntries(entries.filter((entry) => isSubstantive(entry) && pattern.test(entry.text))).slice(0, limit);
}

function evidence(entry) {
  return `- [${entry.timestamp}] ${entry.speaker}: ${entry.text}`;
}

function evidenceList(entries, emptyText = "Not discussed in recording") {
  return entries.length ? entries.map(evidence).join("\n") : `- ${emptyText}`;
}

function filenameTitle(filename) {
  const value = clean(filename).replace(/(?:\.fireflies)?\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ");
  if (!value || /^(unknown|fireflies meeting)$/i.test(value)) return "MCCIA Meeting Documentation";
  return `MCCIA Meeting — ${value}`;
}

function deadline(text) {
  const match = String(text).match(/\b(today|tomorrow|this week|next week|this month|next month|within\s+\d+\s+(?:hour|day|week|month)s?|by\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?))\b/i);
  return match ? match[0] : "Not discussed";
}

function tableCell(value) {
  return clean(value).replaceAll("|", "\\|");
}

function actionTable(entries) {
  if (!entries.length) return "| — | Not discussed in recording | — | — | — |";
  return entries.map((entry, index) => (
    `| ${index + 1} | [${entry.timestamp}] ${tableCell(entry.text)} | ${tableCell(`Not confirmed (stated by ${entry.speaker})`)} | ${tableCell(deadline(entry.text))} | Not discussed |`
  )).join("\n");
}

const actionPattern = /\b(action item|follow[- ]?up|next step|(?:we|i|you|they) (?:will|'ll) (?:send|share|prepare|review|connect|schedule|implement|complete|update|provide|check|write|meet|discuss|work)|need to (?:send|share|prepare|review|connect|schedule|implement|complete|update|provide|check|meet|discuss))\b/i;
const decisionPattern = /\b(decid(?:e|ed|ing)|agreed?|approv(?:e|ed|al)|confirm(?:ed)?|finali[sz](?:e|ed)|resolved?|concluded?)\b/i;
const riskPattern = /\b(risk|concern|problem|issue|challenge|difficult|not possible|unable|delay|blocked|constraint|shortage|failure|fail|compliance)\b/i;
const policyPattern = /\b(policy|regulation|regulatory|government|ministry|scheme|compliance|legal|law|guideline|standard|authority)\b/i;
const communicationPattern = /\b(member|stakeholder|client|customer|vendor|supplier|partner|communicat|email|message|share|inform|notify)\b/i;
const numberPattern = /(?:\d|₹|\$|%|percent|crore|lakh|million|billion)/i;
const topicPattern = /\b(ai|artificial intelligence|automation|data|manufactur|sales|customer|api|report|inventory|quotation|rfq|email|prompt|tool|software|copilot|maya|power bi|databricks|sap|lead|marketing|feasibility)\b/i;

function meetingMinutes(input, entries) {
  const metadata = input.metadata || {};
  const speakers = [...new Set(entries.map((entry) => entry.speaker).filter(Boolean))];
  const decisions = matching(entries.filter((entry) => !/\?$/.test(entry.text)), decisionPattern);
  const actions = matching(entries, actionPattern);
  const questions = uniqueEntries(entries.filter((entry) => isSubstantive(entry) && ((/\?$/.test(entry.text) && topicPattern.test(entry.text)) || /\b(pending|open question|to be confirmed|not decided|whether)\b/i.test(entry.text)))).slice(0, 10);
  const policies = matching(entries, policyPattern, 8);
  const communications = matching(entries, communicationPattern, 8);
  const nextMeeting = matching(entries, /\b(next meeting|meet again|next session|another (?:interaction|meeting|session)|follow[- ]?up session|schedule (?:a|the) meeting)\b/i, 4);

  return `MCCIA MEETING MINUTES
────────────────
Organisation:    Mahratta Chamber of Commerce, Industries and Agriculture (MCCIA)
Committee / Department: Not discussed in recording
Meeting Title:   ${filenameTitle(metadata.filename)} (inferred from source filename)
Date / Time:     Not discussed in recording
Venue / Mode:    Not discussed in recording
Duration:        ${clean(metadata.durationLabel) || "Not discussed in recording"}
Chairperson:     Not discussed in recording
MCCIA Officer-in-Charge: Not discussed in recording
Attendees:       ${speakers.length ? speakers.join(", ") : "Not discussed in recording"}
Language(s):     ${clean(metadata.dominantLanguages) || "Not discussed in recording"}

1. AGENDA / TOPICS DISCUSSED
${evidenceList(spread(entries.filter((entry) => topicPattern.test(entry.text)), 8))}

2. KEY DISCUSSION POINTS
${evidenceList(spread(entries.filter((entry) => entry.text.length >= 60 && topicPattern.test(entry.text) && !/\?$/.test(entry.text)), 12))}

3. DECISIONS MADE
${evidenceList(decisions, "No explicit decisions were detected in the recording")}

4. ACTION ITEMS
| # | Action | Owner / Organisation | Deadline | Priority |
|---|---|---|---|---|
${actionTable(actions)}

5. OPEN QUESTIONS / PENDING ITEMS
${evidenceList(questions, "No explicit open questions were detected in the recording")}

6. POLICY / REGULATORY REFERENCES
${evidenceList(policies)}

7. MEMBER / STAKEHOLDER COMMUNICATIONS
${evidenceList(communications)}
${nextMeeting.length ? `\n8. NEXT MEETING\n${evidenceList(nextMeeting)}` : ""}

Missing Information
- Committee / department, meeting date and time, venue / mode, chairperson, officer-in-charge, deadlines, and priorities are marked as not discussed unless explicitly present above.`;
}

function report(input, entries, originalTranscript) {
  return `REPORT
──────
${filenameTitle(input.metadata?.filename)}

1. Executive Summary
${evidenceList(spread(entries, 7))}

2. Background / Context
${evidenceList(spread(entries, 3))}

3. Findings / Main Content
${evidenceList(spread(entries, 14))}

4. Numbers & Data Mentioned
${evidenceList(matching(entries, numberPattern, 15), "No explicit numbers or data were detected in the recording")}

5. Risks / Concerns Raised
${evidenceList(matching(entries, riskPattern), "No explicit risks or concerns were detected in the recording")}

6. Implications for MCCIA Members / Stakeholders
${evidenceList(matching(entries, communicationPattern, 10))}

7. Recommendations / Next Steps
${evidenceList(matching(entries, actionPattern), "No explicit recommendations or next steps were detected in the recording")}

Appendix: Full Transcript
${originalTranscript}`;
}

function briefing(input, entries, heading) {
  return `${heading}
${filenameTitle(input.metadata?.filename)}

Context
${evidenceList(spread(entries, 3))}

Key Points
${evidenceList(spread(entries, 12))}

Decisions
${evidenceList(matching(entries, decisionPattern), "No explicit decisions were detected in the recording")}

Action Items
${evidenceList(matching(entries, actionPattern), "No explicit actions were detected in the recording")}

Open Questions
${evidenceList(uniqueEntries(entries.filter((entry) => /\?$/.test(entry.text))).slice(0, 10), "No explicit open questions were detected in the recording")}`;
}

export function createQuotaFallbackDocument(input) {
  const transcript = String(input?.transcript || "").trim();
  const entries = parseTranscript(transcript);
  if (!entries.length) throw new Error("The transcript does not contain any usable statements.");
  let document;
  if (input.documentType === "report") document = report(input, entries, transcript);
  else if (input.documentType === "summary") document = briefing(input, entries, "MCCIA MEETING SUMMARY");
  else if (input.documentType === "notes") document = briefing(input, entries, "MCCIA MEETING NOTES");
  else document = meetingMinutes(input, entries);
  const sensitive = entries.some((entry) => /\b(confidential|salary|salaries|personal data|bank account|medical|harassment|conflict)\b/i.test(entry.text));
  return sensitive ? `Confidential items discussed\n\n${document}` : document;
}
