import {
  FaArrowRight,
  FaBed,
  FaBuilding,
  FaCheckCircle,
  FaClock,
  FaCompactDisc,
  FaEnvelope,
  FaFacebookF,
  FaGlobe,
  FaHeadset,
  FaInstagram,
  FaLinkedinIn,
  FaMapMarkerAlt,
  FaMicrochip,
  FaPhoneAlt,
  FaProjectDiagram,
  FaShieldAlt,
  FaTools,
  FaTruck,
  FaTwitter,
  FaUser,
  FaUserPlus,
  FaUsers,
  FaUtensils,
  FaWrench,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import "./LandingPage.css";

const featureBadges = [
  { icon: FaMapMarkerAlt, label: "Real-Time Tracking" },
  { icon: FaProjectDiagram, label: "AI Optimised Routing" },
  { icon: FaClock, label: "On-Time Delivery" },
  { icon: FaShieldAlt, label: "Secure & Insured" },
];

const actionCards = [
  {
    icon: FaBuilding,
    title: "Company Details",
    text: "Thynk Unlimited is a full-service logistics and supply chain management company.",
    link: "Learn More",
  },
  {
    icon: FaUser,
    title: "Existing User",
    text: "Login to your account to manage shipments, track deliveries, view invoices and more.",
    link: "Login Now",
    to: "/login",
  },
  {
    icon: FaUserPlus,
    title: "Join Thynk",
    text: "Create your free account and get access to powerful logistics tools and services.",
    link: "Join Now",
    to: "/client/register",
  },
  {
    icon: FaShieldAlt,
    title: "Our Promise",
    text: "Optimised Load Carriage, Guaranteed On-Time Delivery, Transparent Pricing, 24/7 Support.",
    link: "Learn More",
    promise: true,
  },
];

const partnerLinks = [
  { icon: FaShieldAlt, title: "Insurance", action: "View Plans" },
  { icon: FaBed, title: "Motels", action: "Book Stay" },
  { icon: FaWrench, title: "Garages", action: "Find Garages" },
  { icon: FaUtensils, title: "Restaurants", action: "Find Restaurants" },
  { icon: FaCompactDisc, title: "Accessories", action: "Shop Accessories" },
  { icon: FaTools, title: "Repair Shops", action: "Find Repair Shops" },
];

const stats = [
  { icon: FaTruck, number: "10,000+", label: "Deliveries Completed" },
  { icon: FaUsers, number: "500+", label: "Happy Clients" },
  { icon: FaUsers, number: "50+", label: "Partner Networks" },
  { icon: FaClock, number: "24/7", label: "Support Available" },
];

const reasons = [
  {
    icon: FaMicrochip,
    title: "Advanced Technology",
    text: "AI routes with real-time shipment tracking.",
  },
  {
    icon: FaMapMarkerAlt,
    title: "Nationwide Coverage",
    text: "Reliable delivery coverage across the country.",
  },
  {
    icon: FaShieldAlt,
    title: "Reliable & Secure",
    text: "Secure handling with insured delivery.",
  },
  {
    icon: FaHeadset,
    title: "Customer First",
    text: "24/7 support at every step.",
  },
];

const footerColumns = [
  {
    title: "Quick Links",
    items: ["Home", "Company", "Services", "Fleet Login", "Contact"],
  },
  {
    title: "Services",
    items: ["Transportation", "Warehousing", "Supply Chain", "Distribution"],
  },
];

function Logo() {
  return (
    <Link className="landing-logo" to="/" aria-label="Thynk Unlimited home">
      <span className="landing-logo__mark">
        <FaTruck />
      </span>
      <span>
        <strong>THYNK</strong>
        <strong>UNLIMITED</strong>
      </span>
    </Link>
  );
}

function ArrowLink({ children, to = "#" }) {
  return (
    <Link className="landing-arrow-link" to={to}>
      {children}
      <FaArrowRight aria-hidden="true" />
    </Link>
  );
}

function getFooterLink(item) {
  if (item === "Fleet Login") return "/login";
  return "#home";
}

function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Logo />
        <nav className="landing-nav" aria-label="Primary navigation">
          <a className="active" href="#home">Home</a>
          <a href="#company">Company</a>
          <a href="#services">Services</a>
          <a href="#resources">Resources</a>
          <a href="#partners">Partner Links</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="landing-auth">
          <Link className="landing-btn landing-btn--outline" to="/login">Login</Link>
          <Link className="landing-btn landing-btn--dark" to="/login">Fleet Login</Link>
        </div>
      </header>

      <section className="landing-hero" id="home">
        <div className="landing-hero__content">
          <p className="landing-eyebrow">SMART LOGISTICS. STRONGER CONNECTIONS.</p>
          <h1>AI OPTIMISING LOAD CARRIAGE. GUARANTEED DELIVERY.</h1>
          <p className="landing-hero__copy">
            End-to-end logistics and supply chain solutions designed to move
            your business forward.
          </p>
          <div className="landing-feature-row">
            {featureBadges.map(({ icon: Icon, label }) => (
              <div className="landing-feature" key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="landing-hero__actions">
            <Link className="landing-btn landing-btn--dark landing-btn--large" to="/client/register">
              Request a Free Quote
              <FaArrowRight aria-hidden="true" />
            </Link>
            <Link className="landing-btn landing-btn--outline landing-btn--large" to="/login">
              Track Shipment
              <FaArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section landing-action-grid" id="company" aria-label="Company actions">
        {actionCards.map(({ icon: Icon, title, text, link, promise, to }) => (
          <article className="landing-card landing-action-card" key={title}>
            <Icon className="landing-card__icon" aria-hidden="true" />
            <h2>{title}</h2>
            {promise ? (
              <ul className="landing-promise-list">
                {text.split(", ").map((item) => (
                  <li key={item}>
                    <FaCheckCircle aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{text}</p>
            )}
            <ArrowLink to={to}>{link}</ArrowLink>
          </article>
        ))}
      </section>

      <section className="landing-section" id="services">
        <h2 className="landing-section-title">Essential Services & Partner Links</h2>
        <div className="landing-partners" id="partners">
          {partnerLinks.map(({ icon: Icon, title, action }) => (
            <article className="landing-partner-card" key={title}>
              <Icon aria-hidden="true" />
              <strong>{title}</strong>
              <ArrowLink>{action}</ArrowLink>
            </article>
          ))}
        </div>
        <div className="landing-partner-strip">
          <span>
            <FaGlobe aria-hidden="true" />
            Trusted RSA Partner Links (19)
          </span>
          <ArrowLink>View All Partners</ArrowLink>
        </div>
        <div className="landing-stats">
          {stats.map(({ icon: Icon, number, label }) => (
            <div className="landing-stat" key={label}>
              <Icon aria-hidden="true" />
              <span>
                <strong>{number}</strong>
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-why" id="resources">
        <div className="landing-why__intro">
          <h2>Why Choose<br />Thynk Unlimited?</h2>
          <p>
            Technology, experience and a customer-first approach make us the
            trusted logistics partner.
          </p>
          <Link className="landing-btn landing-btn--dark" to="/client/register">
            Discover More
            <FaArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="landing-reason-grid">
          {reasons.map(({ icon: Icon, title, text }) => (
            <article className="landing-card landing-reason-card" key={title}>
              <Icon className="landing-card__icon" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer" id="contact">
        <div className="landing-footer__grid">
          <div className="landing-footer__brand">
            <Logo />
            <p>Smart logistics. Stronger connections.</p>
            <p>On-time, every time.</p>
            <div className="landing-socials" aria-label="Social links">
              <a href="#contact"><FaFacebookF /></a>
              <a href="#contact"><FaLinkedinIn /></a>
              <a href="#contact"><FaTwitter /></a>
              <a href="#contact"><FaInstagram /></a>
            </div>
          </div>
          {footerColumns.map((column) => (
            <div className="landing-footer__column" key={column.title}>
              <h3>{column.title}</h3>
              {column.items.map((item) => (
                item === "Fleet Login" ? (
                  <Link to={getFooterLink(item)} key={item}>{item}</Link>
                ) : (
                  <a href={getFooterLink(item)} key={item}>{item}</a>
                )
              ))}
            </div>
          ))}
          <div className="landing-footer__contact">
            <h3>Contact Us</h3>
            <p><FaMapMarkerAlt /> 123 Anywhere St., Any City, ST 12345</p>
            <p><FaPhoneAlt /> +27 12 345 6789</p>
            <p><FaEnvelope /> info@thynkunlimited.com</p>
          </div>
          <div className="landing-newsletter">
            <h3>Newsletter</h3>
            <p>Subscribe to get updates and latest news.</p>
            <form>
              <input type="email" placeholder="Enter your email" aria-label="Email address" />
              <button type="submit" aria-label="Subscribe">
                <FaArrowRight />
              </button>
            </form>
          </div>
        </div>
        <div className="landing-footer__bottom">
          <span>© 2024 Thynk Unlimited. All rights reserved.</span>
          <span>
            <a href="#home">Privacy Policy</a>
            <a href="#home">Terms & Conditions</a>
          </span>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
