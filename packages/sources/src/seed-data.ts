import type { SourceConfig } from "./adapter.js";

/** A source to seed into the `sources` registry. Matches the DB `Source` model. */
export interface SeedSource {
  name: string;
  type: "RSS" | "HTML";
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
  {
    name: "Rotherham Advertiser — All",
    type: "RSS",
    url: "https://www.rotherhamadvertiser.co.uk/rss/",
    vertical: "NEWS",
    fetchCadence: NEWS,
    enabled: true,
  },
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
    name: "Wentworth Woodhouse",
    type: "RSS",
    url: "https://wentworthwoodhouse.org.uk/feed/",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: true,
  },
  {
    name: "Reddit r/Rotherham",
    type: "RSS",
    url: "https://www.reddit.com/r/rotherham/.rss",
    vertical: "NEWS",
    fetchCadence: NEWS,
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

  // ── HTML (Cheerio) — disabled pending selector work (see follow-up) ──────
  // A live run showed these need real markup work: council-jobs matched 0 items
  // (wrong selectors) and Eventbrite returned global, non-Rotherham events (URL
  // isn't location-scoping the cards). Seeded with best-guess selectors but
  // disabled so we don't serve wrong data; fix against live markup in follow-up.
  {
    name: "Rotherham MBC — Jobs",
    type: "HTML",
    url: "https://www.rotherham.gov.uk/jobs",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: false,
    config: {
      selectors: {
        item: ".list--articles li, .job-list li",
        title: "a",
        link: "a",
        excerpt: "p",
      },
    },
  },
  {
    name: "Eventbrite — Rotherham",
    type: "HTML",
    url: "https://www.eventbrite.co.uk/d/united-kingdom--rotherham/events/",
    vertical: "EVENTS",
    fetchCadence: SLOW,
    enabled: false,
    config: {
      selectors: {
        item: "section.event-card, div.event-card",
        title: "h3, .event-card__clamp-line--two",
        link: "a.event-card-link",
        image: "img",
      },
    },
  },

  // ── Seeded but disabled — need Playwright (Phase 1b) ─────────────────────
  {
    name: "Rotherham United (Millers) — official",
    type: "HTML",
    url: "https://www.themillers.co.uk/news/",
    vertical: "SPORTS",
    fetchCadence: NEWS,
    enabled: false,
  },
  {
    name: "NHS Jobs — Rotherham",
    type: "HTML",
    url: "https://www.jobs.nhs.uk/candidate/search/results?location=Rotherham",
    vertical: "JOBS",
    fetchCadence: JOBS,
    enabled: false,
  },
];
