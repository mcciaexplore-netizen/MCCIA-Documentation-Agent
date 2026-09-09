import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REGULAR_FONT = path.join(ROOT, "assets", "fonts", "Hind-Regular.ttf");
const BOLD_FONT = path.join(ROOT, "assets", "fonts", "Hind-Bold.ttf");

const COLORS = {
  blue: "#1870ad",
  green: "#169b55",
  ink: "#202620",
  muted: "#68716b",
  line: "#d8ddd8",
  pale: "#f4f7f4",
  white: "#ffffff",
};

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableDivider(line) {
  return tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isSectionHeading(line) {
  return /^(?:#{1,6}\s+|\d+\.\s+|[A-Z][A-Z\s/&()-]{4,}:?$)/.test(line);
}

function cleanHeading(line) {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) doc.addPage();
}

function renderTable(doc, lines) {
  const rows = lines.filter((line) => !isTableDivider(line)).map(tableCells);
  if (!rows.length) return;
  const columns = Math.max(...rows.map((row) => row.length));
  const available = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const actionWidths = columns === 5
    ? [0.07, 0.34, 0.23, 0.18, 0.18].map((fraction) => available * fraction)
    : Array(columns).fill(available / columns);

  rows.forEach((row, rowIndex) => {
    const font = rowIndex === 0 ? "Hind-Bold" : "Hind";
    const fontSize = rowIndex === 0 ? 8.6 : 8.4;
    doc.font(font).fontSize(fontSize);
    const heights = actionWidths.map((width, index) => doc.heightOfString(row[index] || "", { width: width - 10 }));
    const rowHeight = Math.max(24, ...heights.map((height) => height + 10));
    ensureSpace(doc, rowHeight);
    const y = doc.y;
    let x = doc.page.margins.left;
    actionWidths.forEach((width, index) => {
      doc.save()
        .rect(x, y, width, rowHeight)
        .fillAndStroke(rowIndex === 0 ? COLORS.blue : (rowIndex % 2 ? COLORS.white : COLORS.pale), COLORS.line)
        .restore();
      doc.fillColor(rowIndex === 0 ? COLORS.white : COLORS.ink)
        .font(font)
        .fontSize(fontSize)
        .text(row[index] || "", x + 5, y + 5, { width: width - 10, height: rowHeight - 8 });
      x += width;
    });
    doc.x = doc.page.margins.left;
    doc.y = y + rowHeight;
  });
  doc.x = doc.page.margins.left;
  doc.moveDown(0.6);
}

export function createDocumentPdf(documentText, title = "MCCIA Document") {
  const text = String(documentText || "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("Document text is required for PDF export.");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 54, right: 48, bottom: 58, left: 48 },
      bufferPages: true,
      info: { Title: title, Author: "MCCIA Documentation Agent", Creator: "MCCIA Documentation Agent" },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.registerFont("Hind", REGULAR_FONT);
    doc.registerFont("Hind-Bold", BOLD_FONT);

    doc.rect(0, 0, doc.page.width, 12).fill(COLORS.blue);
    doc.rect(doc.page.width - 90, 0, 90, 12).fill(COLORS.green);
    doc.fillColor(COLORS.blue).font("Hind-Bold").fontSize(13).text("MCCIA", 48, 27, { continued: true });
    doc.fillColor(COLORS.muted).font("Hind").fontSize(9).text("  DOCUMENTATION AGENT");
    doc.moveDown(1.2);

    const lines = text.split("\n");
    let firstContentLine = true;
    for (let index = 0; index < lines.length;) {
      const raw = lines[index].trimEnd();
      const line = raw.trim();
      if (!line) {
        doc.moveDown(0.35);
        index += 1;
        continue;
      }
      if (/^[─—_-]{3,}$/.test(line)) {
        doc.moveDown(0.15);
        index += 1;
        continue;
      }
      if (line.startsWith("|") && line.endsWith("|")) {
        const tableLines = [];
        while (index < lines.length && lines[index].trim().startsWith("|") && lines[index].trim().endsWith("|")) {
          tableLines.push(lines[index].trim());
          index += 1;
        }
        renderTable(doc, tableLines);
        continue;
      }

      if (firstContentLine) {
        ensureSpace(doc, 54);
        doc.fillColor(COLORS.ink).font("Hind-Bold").fontSize(19).text(cleanHeading(line), { lineGap: 3 });
        doc.moveDown(0.6);
        firstContentLine = false;
      } else if (isSectionHeading(line)) {
        ensureSpace(doc, 38);
        doc.moveDown(0.5);
        doc.fillColor(COLORS.blue).font("Hind-Bold").fontSize(12.5).text(cleanHeading(line), { lineGap: 2 });
        doc.moveDown(0.25);
      } else if (/^[-*]\s+/.test(line)) {
        ensureSpace(doc, 24);
        doc.fillColor(COLORS.ink).font("Hind").fontSize(10.2)
          .text(`•  ${line.replace(/^[-*]\s+/, "")}`, { indent: 8, lineGap: 2.5 });
      } else {
        ensureSpace(doc, 24);
        doc.fillColor(COLORS.ink).font("Hind").fontSize(10.2).text(line, { lineGap: 2.5 });
      }
      index += 1;
    }

    const range = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      const footerY = doc.page.height - 35;
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 18;
      doc.moveTo(48, footerY - 8).lineTo(doc.page.width - 48, footerY - 8).strokeColor(COLORS.line).stroke();
      doc.fillColor(COLORS.muted).font("Hind").fontSize(8)
        .text("Mahratta Chamber of Commerce, Industries and Agriculture", 48, footerY, { width: 360, height: 12, lineBreak: false })
        .text(`Page ${pageIndex + 1} of ${range.count}`, doc.page.width - 135, footerY, { width: 87, height: 12, align: "right", lineBreak: false });
      doc.page.margins.bottom = originalBottomMargin;
    }
    doc.end();
  });
}
