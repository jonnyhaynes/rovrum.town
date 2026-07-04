# rotherham.town

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)
![License: Proprietary](https://img.shields.io/badge/license-proprietary-red)
[![Website](https://img.shields.io/badge/web-rotherham.town-blue)](https://www.rotherham.town)

> The place for everything Rotherham — news, sports, events, and jobs, aggregated from across the web and served up in one place.

**rotherham.town** is a content platform that gathers news, sports, events, jobs (and more) from many local sources, normalises them into a single feed, and surfaces them on the web and — in time — a mobile app. It also generates social media content automatically, so the whole thing runs with minimal manual effort.

The **data pipeline is the product**; the website and app are views onto it.

> ⚠️ **Alpha.** This project is in early development. The architecture is agreed but the build has only just begun — expect things to change and break.

## How it works

- **Aggregator model** — stores each item's headline, excerpt, source attribution, and a link to the original. It never rehosts full third-party content; it points you to the source.
- **Ingestion first** — standalone workers pull from RSS feeds, APIs, and (where needed) scraped pages, then normalise everything into a shared content model.
- **Automated social** — generated posts for X, Facebook/Instagram, LinkedIn, and TikTok, with a human-approval step before anything goes out.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm + Turborepo |
| Web | Astro |
| Mobile *(later)* | Expo / React Native |
| Database | PostgreSQL + Prisma |
| Queue / scheduling | pg-boss (on Postgres) |
| Workers | Dockerised standalone Node |
| Scraping | Cheerio / RSS, Playwright where needed |
| AI | Provider-agnostic layer |
| Storage | Cloudflare R2 (S3-compatible) |
| Hosting | Vercel/Cloudflare (web) + Railway/Fly (workers/DB) |

Everything is **Docker-first and portable** — any host is a deploy target, never a dependency.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture decision record, rationale, and phased plan.

## Roadmap

- [ ] **Phase 0 — Foundation:** monorepo, docker infra, DB schema
- [ ] **Phase 1 — Ingestion:** source adapters, scheduler, dedup, data-quality verification
- [ ] **Phase 2 — Web MVP:** Astro site, News vertical then the rest
- [ ] **Phase 3 — AI + Social:** content generation, scheduling, approval queue
- [ ] **Phase 4 — Mobile:** Expo app on the shared API

## License

Proprietary — all rights reserved. See [`LICENSE`](LICENSE).
