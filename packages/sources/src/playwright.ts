import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { chromium, type Browser, type Page } from "playwright";
import type { FetchedItem } from "@rovrum/core";
import type {
  AdapterSource,
  FetchDeps,
  HtmlSelectors,
  PlaywrightConfig,
  PlaywrightStep,
  SourceAdapter,
} from "./adapter.js";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const NAV_TIMEOUT_MS = 30_000;
const DEFAULT_SHOW_MORE_LIMIT = 20;

/**
 * Playwright adapter for JS-rendered sources (Millers Nuxt app, iTrent job portal)
 * — the last resort when a page has no server-rendered items, feed, or embedded
 * JSON. The *mechanism* is source-agnostic (goto → consent → steps → wait → show-
 * more → scrape); the per-site recipe lives in `config.playwright`, and items are
 * extracted from the rendered DOM with the same `config.selectors` as HtmlAdapter.
 *
 * The browser is expensive, so the worker owns a single long-lived instance and
 * injects it via `FetchDeps.browser`. This adapter creates a fresh context+page per
 * fetch and always closes the context (even on error). If no browser is injected it
 * launches (and closes) its own — convenient for one-off scripts and tests, not the
 * hot path.
 */
export class PlaywrightAdapter implements SourceAdapter {
  private readonly injectedBrowser?: Browser;
  private readonly userAgent: string;

  constructor(deps: FetchDeps = {}) {
    this.injectedBrowser = deps.browser;
    this.userAgent = deps.userAgent ?? DEFAULT_UA;
  }

  async fetch(source: AdapterSource): Promise<FetchedItem[]> {
    const pw = source.config?.playwright;
    const selectors = source.config?.selectors;
    if (!pw?.waitFor) {
      throw new Error(`Playwright source ${source.id} needs config.playwright.waitFor`);
    }
    if (!selectors?.item || !selectors.title || !selectors.link) {
      throw new Error(`Playwright source ${source.id} needs config.selectors with item/title/link`);
    }

    // Use the injected shared browser; otherwise launch a throwaway one.
    const ownBrowser = this.injectedBrowser ? undefined : await chromium.launch();
    const browser = this.injectedBrowser ?? ownBrowser!;
    const context = await browser.newContext({ userAgent: this.userAgent });
    try {
      const page = await context.newPage();
      const html = await this.render(page, source.url, pw);
      return extractCards(html, source.url, selectors);
    } finally {
      await context.close();
      if (ownBrowser) await ownBrowser.close();
    }
  }

  /** Drive the page through its recipe and return the rendered HTML. */
  private async render(page: Page, url: string, pw: PlaywrightConfig): Promise<string> {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

    if (pw.consentClick) {
      // Best-effort — a consent banner may or may not appear.
      const banner = page.locator(pw.consentClick).first();
      if (await banner.count()) await banner.click({ timeout: 5_000 }).catch(() => {});
    }

    for (const step of pw.steps ?? []) {
      await runStep(page, step);
    }

    await page.waitForSelector(pw.waitFor, { timeout: NAV_TIMEOUT_MS });

    if (pw.showMore) {
      const limit = pw.showMoreLimit ?? DEFAULT_SHOW_MORE_LIMIT;
      for (let i = 0; i < limit; i++) {
        const btn = page.locator(pw.showMore).first();
        if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) break;
        await btn.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(750); // let the next page of results render
      }
    }

    return page.content();
  }
}

async function runStep(page: Page, step: PlaywrightStep): Promise<void> {
  switch (step.action) {
    case "click":
      await page.locator(step.selector).first().click({ timeout: 10_000 });
      return;
    case "select":
      await page.locator(step.selector).first().selectOption(step.value);
      return;
    case "fill":
      await page.locator(step.selector).first().fill(step.value);
      return;
    case "waitFor":
      await page.waitForSelector(step.selector, { timeout: NAV_TIMEOUT_MS });
      return;
  }
}

// Extract items from rendered HTML with Cheerio — identical parsing to the HTML
// adapter's card strategy, so the two share the same selector contract and tests
// can assert against saved rendered HTML with no live browser.
function extractCards(
  html: string,
  baseUrl: string,
  selectors: HtmlSelectors,
): FetchedItem[] {
  const $ = cheerio.load(html);
  const items: FetchedItem[] = [];
  $(selectors.item).each((_, el) => {
    const item = extractItem($, $(el), selectors, baseUrl);
    if (item) items.push(item);
  });
  return items;
}

function extractItem(
  $: cheerio.CheerioAPI,
  $el: Cheerio<AnyNode>,
  selectors: HtmlSelectors,
  baseUrl: string,
): FetchedItem | null {
  const title = $el.find(selectors.title).first().text().trim();
  const href =
    $el.find(selectors.link).first().attr("href") ??
    // The item container itself may be the anchor.
    ($el.is("a") ? $el.attr("href") : undefined);
  if (!title || !href) return null;

  const summary = selectors.excerpt
    ? $el.find(selectors.excerpt).first().text().trim() || undefined
    : undefined;
  const imgSrc = selectors.image ? $el.find(selectors.image).first().attr("src") : undefined;

  return {
    title,
    link: resolve(href, baseUrl),
    summary,
    imageUrl: imgSrc ? resolve(imgSrc, baseUrl) : undefined,
    raw: { html: $.html($el) },
  };
}

function resolve(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
