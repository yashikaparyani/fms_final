// ─── Printing one thing off a page ────────────────────────────────────────────
// `window.print()` prints the whole application — the sidebar, the topbar, the
// tabs and whatever else happens to be on screen. For a document somebody has to
// file, sign or hand over, that is not a print, it is a screenshot of an app.
//
// So the node is copied into a window of its own along with the page's own
// styles, and that window is printed. Copying the styles rather than writing new
// ones is what makes the printed copy look like the document on screen; the only
// thing added is a print block that drops the page margins to something a
// document can live in.
//
// The alternative — an `@media print` rule hiding everything but one subtree —
// was tried first and is worse: it needs a rule per container between the body
// and the node, so it breaks the moment anything is nested one level deeper.
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_STYLES = `
  @page { margin: 14mm; }
  body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Nothing in a printed document should offer to be clicked. */
  button, .no-print { display: none !important; }
`;

/**
 * Print one DOM node on its own.
 *
 * @param {HTMLElement} node   what to print
 * @param {string}      title  becomes the print job / PDF filename
 * @returns {boolean}   false when the browser blocked the window
 */
export const printElement = (node, title = document.title) => {
  if (!node) return false;

  // A hidden iframe rather than window.open: a popup blocker will silently
  // refuse the latter, and printing is exactly the kind of thing a blocker
  // treats as suspicious because it was not obviously a navigation.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }

  // Every stylesheet the app is using, however Vite happens to be serving them
  // — inline <style> in development, a <link> to a built file in production.
  const styles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((el) => el.outerHTML)
    .join("");

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `${styles}<style>${PRINT_STYLES}</style></head>` +
      `<body>${node.outerHTML}</body></html>`,
  );
  doc.close();

  const run = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      // Left in place briefly: removing the frame in the same tick cancels the
      // print dialog in Safari, which prints asynchronously.
      setTimeout(() => frame.remove(), 1000);
    }
  };

  // Stylesheets referenced by <link> have to arrive before the dialog opens or
  // the preview is unstyled. `onload` fires once the copied document — and the
  // resources it pulled in — is ready.
  if (frame.contentWindow.document.readyState === "complete") {
    run();
  } else {
    frame.onload = run;
  }

  return true;
};

export default printElement;
