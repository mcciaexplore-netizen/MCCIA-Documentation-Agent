import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentPdf } from "../lib/pdf.js";

test("createDocumentPdf creates a multilingual PDF", async () => {
  const pdf = await createDocumentPdf(`MCCIA MEETING MINUTES

Meeting Title: मराठी आणि English बैठक

1. ACTION ITEMS
| # | Action | Owner / Organisation | Deadline | Priority |
| --- | --- | --- | --- | --- |
| 1 | निमंत्रण पाठवा | Priya | Friday | High |`, "MCCIA Meeting Minutes");

  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 10_000);
});
