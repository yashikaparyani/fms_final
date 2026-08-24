const fs = require("fs");

/**
 * Send a stored file to a signed-in caller, inline by default.
 *
 * Inline is the default because these are documents people read to answer a
 * question — is the certificate holder named correctly, has this licence
 * expired, did they initial the arbitration clause. Making someone save a file
 * to find out is a step for nothing, and it leaves copies of a carrier's
 * licence scans scattered across office laptops.
 *
 * `?download=1` on the request forces the save dialog for the cases where
 * somebody genuinely wants the file.
 *
 * Never point a browser at /uploads directly — every one of these documents is
 * scoped to a carrier, and the route that resolves that scope is the only thing
 * standing between one carrier's licences and another's.
 */
const serveFile = (req, res, { filePath, filename, mimeType, missingMessage }) => {
  if (!filePath) {
    return res.status(404).json({ message: missingMessage || "No file on record." });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(410).json({ message: "That file is no longer on the server." });
  }

  if (req.query.download) {
    return res.download(filePath, filename);
  }

  res.type(mimeType || "application/pdf");
  // Quotes stripped rather than escaped: a filename is built from a carrier
  // code and a document title, and a stray quote would break the header rather
  // than mean anything.
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${String(filename || "document").replace(/"/g, "")}"`,
  );

  return fs.createReadStream(filePath).pipe(res);
};

module.exports = { serveFile };
