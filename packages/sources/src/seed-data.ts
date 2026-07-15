import { ROTHERHAM_TOWNS } from "@rovrum/core";
import type { SourceConfig } from "./adapter.js";

/** A source to seed into the `sources` registry. Matches the DB `Source` model. */
export interface SeedSource {
  name: string;
  type: "RSS" | "HTML" | "PLAYWRIGHT";
  url: string;
  vertical: "NEWS" | "SPORTS" | "EVENTS" | "JOBS";
  /** Fetch cadence in minutes. */
  fetchCadence: number;
  /** Disabled sources are seeded but not fetched (need Playwright — Phase 1b). */
  enabled: boolean;
  config?: SourceConfig;
}

// Cadence bands (minutes): fast-moving news vs. slower listings/jobs.
const NEWS = 30;
const SLOW = 120;
const JOBS = 180;

/**
 * The verified Rotherham source registry (checked live 2026-07-06). Seeded into
 * `sources` idempotently (upsert on URL). See docs/plans/phase-1-ingestion.md.
 *
 * `config.regional: true` → the worker applies the Rotherham relevance filter,
 * because these feeds carry non-Rotherham items.
 * `enabled: false` → seeded for completeness but needs the Playwright adapter.
 */
export const SEED_SOURCES: SeedSource[] = [
  // ── Rotherham Advertiser (native, high-quality) ──────────────────────────
  // NB: the site-wide "All" feed (/rss/) is intentionally NOT seeded — it's a
  // superset of the vertical feeds below (so every item is a dup the exact hash
  // already collapses) and flattens everything to NEWS, losing the vertical. The
  // vertical-specific feeds cover the same items with correct tagging.
  {
    name: "Rotherham Advertiser — News",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/news/rss/",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "Rotherham Advertiser — Sport",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/sport/rss/",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "Rotherham Advertiser — Rotherham United",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/sport/football/rotherham-united/rss/",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "Rotherham Advertiser — What's On",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/whats-on/rss/",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: true,
  },
  {
    name: "Rotherham Advertiser — Jobs",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/jobs/rss/",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: true,
  },

  // ── Rotherham MBC (official council) ─────────────────────────────────────
  {
    name: "Rotherham MBC — News",
    type: "RSS",
    url: "https://www.rotherham.gov.uk/rss/news",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "Rotherham MBC — Events",
    type: "RSS",
    url: "https://www.rotherham.gov.uk/rss/events",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: true,
  },

  // ── The Star (regional — needs relevance filter) ─────────────────────────
  {
    name: "The Star — News",
    type: "RSS",
    url: "https://www.thestar.co.uk/news/rss",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
    config: { regional: true },
  },
  {
    name: "The Star — Sport",
    type: "RSS",
    url: "https://www.thestar.co.uk/sport/rss",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: true,
    config: { regional: true },
  },
  {
    name: "The Star — Rotherham United",
    type: "RSS",
    url: "https://www.thestar.co.uk/sport/football/rotherham-united/rss",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: true,
  },

  // ── Other news (native + regional) ───────────────────────────────────────
  {
    name: "YorkshireLive — Rotherham tag",
    type: "RSS",
    url: "https://www.examinerlive.co.uk/all-about/rotherham/?service=rss",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "BBC News — South Yorkshire",
    type: "RSS",
    url: "https://feeds.bbci.co.uk/news/england/south_yorkshire/rss.xml",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
    config: { regional: true },
  },
  {
    name: "Rother Radio",
    type: "RSS",
    url: "https://www.rotherradio.co.uk/feed/",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
  },
  {
    name: "Rotherham College",
    type: "RSS",
    url: "https://www.rotherham.ac.uk/feed/",
    vertical: "NEWS",
    fetchCadence: SLOW,
    enabled: true,
  },
  {
    // The site-wide /feed/ is empty (events are a custom post type); the events
    // feed carries the real items. It 403s a bare client — the worker sends a
    // browser-like UA to clear the WordPress/WAF bot block (no browser needed).
    name: "Wentworth Woodhouse",
    type: "RSS",
    url: "https://wentworthwoodhouse.org.uk/whats-on/feed/",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: true,
  },
  // ── Jobs ─────────────────────────────────────────────────────────────────
  {
    name: "Reed — Rotherham jobs",
    type: "RSS",
    url: "https://www.reed.co.uk/jobs/rss?keywords=&locationName=Rotherham",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: true,
  },

  // ── Eventbrite (HTML, JSON-LD strategy) — Rotherham-area events ──────────
  // The listing page ships an `application/ld+json` ItemList with per-event
  // `location.address.addressLocality`, so we extract from that (robust) and keep
  // only Rotherham-area localities — the `/d/united-kingdom--rotherham/` URL is a
  // loose "near" browse, not a filter, so the towns list does the real scoping.
  // NOT `regional`: the keyword filter runs on title/excerpt and would wrongly drop
  // a genuinely-local event with a generic title (e.g. "Yoga for Mobility"). The
  // structured-locality filter is the precise, sufficient gate.
  {
    name: "Eventbrite — Rotherham",
    type: "HTML",
    url: "https://www.eventbrite.co.uk/d/united-kingdom--rotherham/events/",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: true,
    config: {
      strategy: "jsonLd",
      localityAllow: [...ROTHERHAM_TOWNS],
    },
  },

  // NHS Jobs is fully server-rendered (NHS.UK design system) — plain Cheerio, no
  // browser. Stable `data-test` hooks; the title anchor is both title and link.
  {
    name: "NHS Jobs — Rotherham",
    type: "HTML",
    url: "https://www.jobs.nhs.uk/candidate/search/results?location=Rotherham",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: true,
    config: {
      selectors: {
        item: 'li[data-test="search-result"]',
        title: '[data-test="search-result-job-title"]',
        link: '[data-test="search-result-job-title"]',
        excerpt: '[data-test="search-result-location"]',
      },
    },
  },

  // ── Playwright (JS-rendered) — recipes confirmed against the live DOM 2026-07-09 ──
  // Millers: client-rendered Nuxt; the news API is AWS-Cognito-gated (spike hit 401),
  // so scrape the rendered DOM. `a.news-article` cards, `h3` titles, real per-article
  // URLs on the card anchor itself.
  {
    name: "Rotherham United (Millers) — official",
    type: "PLAYWRIGHT",
    url: "https://www.themillers.co.uk/news/",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: true,
    config: {
      playwright: {
        waitFor: "a.news-article",
        // The hero card renders first (~1s); the rest hydrate by ~3s.
        settleMs: 4000,
        consentClick: "#onetrust-accept-btn-handler",
      },
      selectors: {
        item: "a.news-article", // the card is itself the anchor
        title: "h3",
        link: "a.news-article",
      },
    },
  },
  // iTrent (WebiTrent): `rotherham.gov.uk/jobs` is a hub; real vacancies render on
  // this portal, but it exposes NO stable per-vacancy URL (links are
  // javascript:void(0), results come from session-bound JSON). Decision: ingest
  // anyway, linking every job to the search-results page (linkFallbackToSource).
  // Trade-off: all iTrent jobs share one canonical link → title-only dedup.
  {
    name: "Rotherham MBC — Jobs",
    type: "PLAYWRIGHT",
    url: "https://ce0351li.webitrent.com/ce0351li_webrecruitment/wrd/run/ETREC179GF.open?WVID=70298800Qz",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: true,
    config: {
      playwright: {
        waitFor: ".Mhr-jobDetailTitleContainer",
        linkFallbackToSource: true,
      },
      selectors: {
        item: ".Mhr-jobDetailTitleContainer",
        // The anchor has a visible title span + an aria-hidden " Job profile" span;
        // target the first span so the suffix doesn't bleed into the title.
        title: "a.Mhr-jobDetailTitleLink span:first-child",
        link: "a.Mhr-jobDetailTitleLink",
      },
    },
  },
];
