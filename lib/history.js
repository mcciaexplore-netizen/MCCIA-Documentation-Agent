import { query } from "./db.js";

const MAX_TITLE_LENGTH = 200;

function requireTitle(value) {
  const title = String(value || "").trim().slice(0, MAX_TITLE_LENGTH);
  return title || "Untitled document";
}

async function saveHistoryDocument(userId, entry) {
  const result = await query(
    `INSERT INTO documents (user_id, title, document_type, variant, output_language, transcript, content, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, title, document_type, variant, output_language, model, created_at`,
    [
      userId,
      requireTitle(entry.title),
      String(entry.documentType || "document"),
      String(entry.variant || "original"),
      entry.outputLanguage || null,
      entry.transcript || null,
      String(entry.content || ""),
      entry.model || null,
    ],
  );
  return result.rows[0];
}

async function listHistoryDocuments(userId) {
  const result = await query(
    `SELECT id, title, document_type, variant, output_language, model, created_at
     FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [userId],
  );
  return result.rows;
}

async function getHistoryDocument(userId, id) {
  const result = await query(
    `SELECT id, title, document_type, variant, output_language, transcript, content, model, created_at
     FROM documents WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return result.rows[0] || null;
}

async function deleteHistoryDocument(userId, id) {
  await query("DELETE FROM documents WHERE user_id = $1 AND id = $2", [userId, id]);
}

export { deleteHistoryDocument, getHistoryDocument, listHistoryDocuments, saveHistoryDocument };
