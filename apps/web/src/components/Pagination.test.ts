import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, it, expect } from "vitest";
import Pagination from "./Pagination.astro";

async function render(props: {
  prevUrl?: string | undefined;
  nextUrl?: string | undefined;
  current: number;
  last: number;
}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(Pagination, { props });
}

describe("Pagination", () => {
  it("links to prev and next when both exist", async () => {
    const html = await render({
      prevUrl: "/",
      nextUrl: "/3",
      current: 2,
      last: 5,
    });
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/3"');
    expect(html).toContain("2");
    expect(html).toContain("5");
  });

  it("omits the prev link on the first page", async () => {
    const html = await render({ prevUrl: undefined, nextUrl: "/2", current: 1, last: 3 });
    expect(html).toContain('href="/2"');
    // No anchor labelled previous when there's nowhere to go back to.
    expect(html).not.toMatch(/rel=["']prev["']/);
  });

  it("omits the next link on the last page", async () => {
    const html = await render({ prevUrl: "/2", nextUrl: undefined, current: 3, last: 3 });
    expect(html).toContain('href="/2"');
    expect(html).not.toMatch(/rel=["']next["']/);
  });

  it("renders nothing useful when there is a single page", async () => {
    const html = await render({ prevUrl: undefined, nextUrl: undefined, current: 1, last: 1 });
    expect(html).not.toMatch(/<a\s/);
  });
});
