import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getSeoForPath, SITE_URL } from "../seo/seoConfig";

// Creates or updates a <meta> tag in <head>.
function setMeta(key, content, attr = "name") {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Creates or updates the canonical <link>.
function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Renders nothing — just keeps the document title and SEO meta tags in sync
 * with the current route. Mounted once inside the Router.
 */
export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title, description } = getSeoForPath(pathname);

    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", `${SITE_URL}${pathname}`, "property");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setCanonical(`${SITE_URL}${pathname}`);
  }, [pathname]);

  return null;
}
