const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const PAGE_SIZE = { width: 674, height: 442 };

const POD_DIR = path.join(__dirname, "..", "uploads", "pod");

const ensurePodDir = () => {
  fs.mkdirSync(POD_DIR, { recursive: true });
};

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US");
};

const formatTime = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const safeText = (value) => (value === undefined || value === null ? "" : String(value));

const drawLineLabel = (doc, label, value, x, y, width) => {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
  const labelWidth = doc.widthOfString(label);
  doc.text(label, x, y);
  
  const padding = 4;
  const lineStartX = x + labelWidth + padding;
  const lineWidth = width - labelWidth - padding;
  
  doc.moveTo(lineStartX, y + 9).lineTo(x + width, y + 9).lineWidth(0.7).strokeColor("#1f2937").stroke();
  
  if (value) {
    doc.font("Helvetica").fontSize(8.25).fillColor("#111827");
    doc.text(value, lineStartX + 2, y, { width: lineWidth - 4, ellipsis: true });
  }
};

const drawCheckbox = (doc, x, y, label) => {
  doc.rect(x, y, 8, 8).lineWidth(0.6).strokeColor("#111827").stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor("#111827").text(label, x + 12, y - 1);
};

const drawTruckIcon = (doc, x, y, scale = 1) => {
  doc.save();
  doc.translate(x, y);
  doc.scale(scale, scale);

  doc.fillColor("#6b7280");
  doc.rect(0, 17, 38, 18).fill();
  doc.rect(36, 9, 18, 26).fill();
  doc.rect(54, 17, 14, 18).fill();
  doc.rect(66, 14, 18, 21).fill();

  doc.fillColor("#9ca3af");
  doc.rect(3, 14, 14, 6).fill();
  doc.rect(17, 11, 12, 4).fill();
  doc.rect(40, 14, 12, 10).fill();
  doc.rect(55, 18, 10, 5).fill();

  doc.fillColor("#111827");
  doc.circle(16, 38, 5.5).fill();
  doc.circle(48, 38, 5.5).fill();
  doc.circle(74, 38, 5.5).fill();

  doc.fillColor("#f9fafb");
  doc.circle(16, 38, 2.2).fill();
  doc.circle(48, 38, 2.2).fill();
  doc.circle(74, 38, 2.2).fill();

  doc.restore();
};

const drawTable = (doc, x, y, width, rowHeights, colWidths) => {
  const totalHeight = rowHeights.reduce((sum, item) => sum + item, 0);
  doc.save();
  doc.lineWidth(0.6).strokeColor("#111827");
  doc.rect(x, y, width, totalHeight).stroke();

  let cursorY = y;
  for (let i = 0; i < rowHeights.length - 1; i += 1) {
    cursorY += rowHeights[i];
    doc.moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
  }

  const verticalBoundaries = [];
  let cursorX = x;
  for (let i = 0; i < colWidths.length - 1; i += 1) {
    cursorX += colWidths[i];
    verticalBoundaries.push(cursorX);
    doc.moveTo(cursorX, y).lineTo(cursorX, y + totalHeight).stroke();
  }
  doc.restore();
  return { totalHeight, verticalBoundaries };
};

const drawCenteredCellText = (doc, text, x, y, width, height, options = {}) => {
  doc.font(options.bold ? "Helvetica-Bold" : "Helvetica");
  doc.fontSize(options.fontSize || 7.5);
  doc.fillColor(options.color || "#111827");
  doc.text(text || "", x + 4, y + 4, {
    width: width - 8,
    height: height - 8,
    align: options.align || "left",
    valign: options.valign || "top",
    ellipsis: true,
  });
};

const buildPodDocument = async ({ load, signatureData, receivedBy }) => {
  ensurePodDir();

  const fileName = `${load.loadId}-POD.pdf`;
  const filePath = path.join(POD_DIR, fileName);
  const doc = new PDFDocument({ size: [PAGE_SIZE.width, PAGE_SIZE.height], margin: 0 });
  const writeStream = fs.createWriteStream(filePath);

  const completion = new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve({ fileName, filePath }));
    writeStream.on("error", reject);
    doc.on("error", reject);
  });

  doc.pipe(writeStream);

  doc.rect(0, 0, PAGE_SIZE.width, PAGE_SIZE.height).fill("#ffffff");

  drawTruckIcon(doc, 16, 14, 0.9);

  drawLineLabel(doc, "LOAD NO.", load.loadId, 126, 23, 102);
  drawLineLabel(doc, "LUMPER: $", safeText(load.totalLumper || load.lumperAmount || ""), 126, 43, 102);
  drawLineLabel(doc, "Date:", formatDate(load.deliveredAt || load.updatedAt || new Date()), 300, 23, 92);

  drawCheckbox(doc, 520, 14, "EMPTY");
  drawCheckbox(doc, 580, 14, "LOADED");
  drawCheckbox(doc, 520, 30, "CHASSIS");
  drawCheckbox(doc, 587, 30, "CONTAINER");
  drawCheckbox(doc, 520, 46, "SPLIT");
  drawCheckbox(doc, 587, 46, "FLIP");
  drawCheckbox(doc, 587, 62, "SCALE TICKET");

  drawLineLabel(doc, "SHIPPER", safeText(load.pickup?.company || load.pickup?.address || ""), 16, 70, 252);
  drawLineLabel(doc, "CONSIGNEE", safeText(load.drop?.company || load.drop?.address || ""), 332, 70, 324);
  drawLineLabel(doc, "ADDRESS", safeText(load.pickup?.address || ""), 16, 89, 252);
  drawLineLabel(doc, "ADDRESS", safeText(load.drop?.address || ""), 332, 89, 324);
  drawLineLabel(doc, "CITY", safeText(load.pickup?.city || ""), 16, 108, 252);
  drawLineLabel(doc, "CITY", safeText(load.drop?.city || ""), 332, 108, 324);

  const tableX = 16;
  const tableY = 123;
  const tableWidth = 642;
  
  const rowHeights1 = [18, 18];
  const colWidths1 = [210, 216, 216];
  drawTable(doc, tableX, tableY, tableWidth, rowHeights1, colWidths1);

  const rowHeights2 = [18, 27, 27, 27, 27];
  const colWidths2 = [82, 392, 168];
  drawTable(doc, tableX, tableY + 36, tableWidth, rowHeights2, colWidths2);

  const rowHeights = [...rowHeights1, ...rowHeights2];
  const colWidths = colWidths1;

  const firstRowY = tableY;
  const secondRowY = tableY + rowHeights[0];
  const headerRowY = tableY + rowHeights[0] + rowHeights[1];
  const dataStartY = headerRowY + rowHeights[2];

  drawCenteredCellText(doc, "CONTAINER #", tableX, firstRowY, colWidths[0], rowHeights[0], { bold: true });
  drawCenteredCellText(doc, "VESSEL", tableX + colWidths[0], firstRowY, colWidths[1], rowHeights[0], { bold: true });
  drawCenteredCellText(doc, "PORT", tableX + colWidths[0] + colWidths[1], firstRowY, colWidths[2], rowHeights[0], { bold: true });

  drawCenteredCellText(doc, safeText(load.containerNo || ""), tableX, firstRowY, colWidths[0], rowHeights[0], { fontSize: 7.25, align: "right" });
  drawCenteredCellText(doc, safeText(load.shippingLine || ""), tableX + colWidths[0], firstRowY, colWidths[1], rowHeights[0], { fontSize: 7.25, align: "right" });
  drawCenteredCellText(doc, safeText(load.pickup?.city || ""), tableX + colWidths[0] + colWidths[1], firstRowY, colWidths[2], rowHeights[0], { fontSize: 7.25, align: "right" });

  drawCenteredCellText(doc, "CHASSIS #", tableX, secondRowY, colWidths[0], rowHeights[1], { bold: true });
  drawCenteredCellText(doc, "B/L OR BK", tableX + colWidths[0], secondRowY, colWidths[1], rowHeights[1], { bold: true });
  drawCenteredCellText(doc, "SEAL #", tableX + colWidths[0] + colWidths[1], secondRowY, colWidths[2], rowHeights[1], { bold: true });

  drawCenteredCellText(doc, safeText(load.pickupNo || ""), tableX, secondRowY, colWidths[0], rowHeights[1], { fontSize: 7.25, align: "right" });
  drawCenteredCellText(doc, safeText(load.bookingNo || ""), tableX + colWidths[0], secondRowY, colWidths[1], rowHeights[1], { fontSize: 7.25, align: "right" });
  drawCenteredCellText(doc, safeText(load.sealNo || ""), tableX + colWidths[0] + colWidths[1], secondRowY, colWidths[2], rowHeights[1], { fontSize: 7.25, align: "right" });

  drawCenteredCellText(doc, "NO. PIECES", tableX, headerRowY, 82, rowHeights[2], { bold: true });
  drawCenteredCellText(doc, "DESCRIPTION OF COMMODITIES", tableX + 82, headerRowY, 392, rowHeights[2], { bold: true, align: "center" });
  drawCenteredCellText(doc, "WEIGHT", tableX + 474, headerRowY, 168, rowHeights[2], { bold: true, align: "center" });

  const commodityLines = [
    safeText(load.material || load.description || ""),
    safeText(load.remarks || ""),
  ].filter(Boolean);

  drawCenteredCellText(doc, safeText(load.pickup?.pieces || ""), tableX, dataStartY, 82, rowHeights[3], { fontSize: 7.25, align: "center" });
  drawCenteredCellText(doc, commodityLines[0] || "", tableX + 82, dataStartY, 392, rowHeights[3], { fontSize: 7.25 });
  drawCenteredCellText(doc, safeText(load.pickup?.weight || ""), tableX + 474, dataStartY, 168, rowHeights[3], { fontSize: 7.25, align: "center" });

  for (let i = 1; i < 4; i += 1) {
    const rowY = dataStartY + rowHeights[3] * i;
    drawCenteredCellText(doc, "", tableX, rowY, 82, rowHeights[3], { fontSize: 7.25, align: "center" });
    drawCenteredCellText(doc, commodityLines[i] || "", tableX + 82, rowY, 392, rowHeights[3], { fontSize: 7.25 });
    drawCenteredCellText(doc, "", tableX + 474, rowY, 168, rowHeights[3], { fontSize: 7.25, align: "center" });
  }

  const lowerY = 311;
  doc.font("Helvetica").fontSize(7.5).fillColor("#111827");
  doc.rect(16, lowerY, 10, 10).stroke();
  doc.rect(16, lowerY + 10, 10, 10).stroke();
  doc.text("LOADING:", 28, lowerY - 1);
  doc.text("UNLOADING:", 28, lowerY + 9);
  doc.text("TIME IN", 83, lowerY - 1);
  doc.moveTo(110, lowerY + 8).lineTo(205, lowerY + 8).stroke();
  doc.text("TIME OUT", 208, lowerY - 1);
  doc.moveTo(247, lowerY + 8).lineTo(341, lowerY + 8).stroke();
  doc.text("SIGN", 345, lowerY - 1);
  doc.moveTo(370, lowerY + 8).lineTo(470, lowerY + 8).stroke();

  doc.text("WAIT TIME:", 16, lowerY + 24);
  doc.text("TIME IN", 89, lowerY + 24);
  doc.moveTo(118, lowerY + 33).lineTo(210, lowerY + 33).stroke();
  doc.text("TIME OUT", 212, lowerY + 24);
  doc.moveTo(251, lowerY + 33).lineTo(345, lowerY + 33).stroke();
  doc.text("SIGN", 347, lowerY + 24);
  doc.moveTo(373, lowerY + 33).lineTo(473, lowerY + 33).stroke();

  const pickedUp = load.pickedUpAt ? formatTime(load.pickedUpAt) : "";
  const delivered = load.deliveredAt ? formatTime(load.deliveredAt) : "";

  doc.font("Helvetica").fontSize(7.25).fillColor("#111827");
  // LOADING row = actual pickup time; TIME OUT mirrors TIME IN.
  doc.text(pickedUp, 118, lowerY - 2, { width: 80, align: "left" });
  doc.text(pickedUp, 251, lowerY - 2, { width: 80, align: "left" });
  // UNLOADING/WAIT row = actual delivery time; TIME OUT mirrors TIME IN.
  doc.text(delivered, 118, lowerY + 23, { width: 80, align: "left" });
  doc.text(delivered, 251, lowerY + 23, { width: 80, align: "left" });

  doc.rect(16, 362, 228, 36).stroke();
  doc.rect(244, 362, 102, 36).stroke();
  doc.rect(346, 362, 116, 36).stroke();
  doc.rect(462, 362, 196, 36).stroke();

  doc.font("Helvetica-Bold").fontSize(8).text("DRIVER", 18, 368);
  doc.font("Helvetica").fontSize(7.5).text(safeText(load.assignedFleetOwner?.fleetOwnerName || load.assignedFleetOwner?.driverName || ""), 18, 378, { width: 220, ellipsis: true });

  doc.font("Helvetica-Bold").fontSize(8).text("TRUCK NO.", 248, 368);
  doc.font("Helvetica").fontSize(7.5).text(safeText(load.truckNo || load.containerNo || ""), 248, 378, { width: 94, ellipsis: true });

  doc.font("Helvetica-Bold").fontSize(8).text("TOTAL TO COLLECT", 350, 368, { width: 108, align: "center" });
  // Intentionally left blank — the collect amount is not printed on the POD.

  doc.font("Helvetica-Bold").fontSize(8).text("RECEIVED", 490, 368);
  doc.font("Helvetica-Bold").fontSize(8).text("BY    X", 490, 382);

  // The name under the signature. A mark on its own does not say who took the
  // delivery, and that is the first thing asked when one is disputed — so the
  // name the driver was given at the door is printed with it, in the strip
  // below the signature box.
  const receiverName = safeText(receivedBy?.name || load.receivedBy?.name || "");
  if (receiverName) {
    const receiverTitle = safeText(receivedBy?.title || load.receivedBy?.title || "");
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#374151")
      .text(
        receiverTitle ? `${receiverName} — ${receiverTitle}` : receiverName,
        466,
        390,
        { width: 188, align: "right", ellipsis: true },
      );
    doc.fillColor("#111827");
  }

  if (signatureData) {
    const signatureBuffer = Buffer.from(signatureData.split(",")[1] || signatureData, "base64");
    // Larger box (kept right of the "BY X" label) so a trimmed signature
    // renders big enough to read. `fit` preserves aspect ratio.
    doc.image(signatureBuffer, 518, 364, { fit: [136, 32], align: "center", valign: "center" });
  }

  doc.end();
  return completion;
};

module.exports = {
  buildPodDocument,
};