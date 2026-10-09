import { Link } from "react-router-dom";
import { FaTruck, FaArrowLeft } from "react-icons/fa";
import "./LegalPage.css";

/**
 * Shared chrome for the public legal/support pages (/privacy, /support).
 *
 * These are linked from the landing-page footer and — more importantly — are
 * the URLs Apple requires for the App Store listing, so they have to be
 * publicly reachable without a login and look like part of the site.
 */
function LegalLayout({ eyebrow, title, intro, updated, children }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-logo" to="/" aria-label="Home">
          <span className="legal-logo__mark"><FaTruck /></span>
          <span>
            <strong>S LINE</strong>
            <strong>TRANSPORT</strong>
          </span>
        </Link>
        <Link className="legal-back" to="/">
          <FaArrowLeft aria-hidden="true" /> Back to site
        </Link>
      </header>

      <section className="legal-hero">
        {eyebrow ? <p className="legal-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
        {updated ? <p className="legal-updated">Last updated: {updated}</p> : null}
      </section>

      <div className="legal-body">{children}</div>

      <footer className="legal-footer">
        <span>© {new Date().getFullYear()} S Line Brokerage Inc. All rights reserved.</span>
        <span className="legal-footer__links">
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/support">Support</Link>
          <Link to="/login">Login</Link>
        </span>
      </footer>
    </main>
  );
}

export default LegalLayout;
