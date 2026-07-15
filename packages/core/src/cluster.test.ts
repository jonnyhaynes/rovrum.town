import { describe, it, expect } from "vitest";
import { clusterKey, similarity, sameStory, CLUSTER_THRESHOLD } from "./cluster.js";

describe("clusterKey", () => {
  it("lowercases, strips punctuation and splits into tokens", () => {
    expect(clusterKey("Council's Budget Approved!")).toEqual(new Set(["council", "budget", "approved"]));
  });

  it("is order-independent (a set, not a sequence)", () => {
    expect(clusterKey("budget council approved")).toEqual(clusterKey("approved council budget"));
  });

  it("drops stopwords", () => {
    expect(clusterKey("The fire at the school")).toEqual(new Set(["fire", "school"]));
  });

  it("drops local-noise words that appear in most local headlines", () => {
    // "rotherham", "millers", "rufc", "united" carry no story identity here.
    expect(clusterKey("Rotherham United sign striker")).toEqual(new Set(["sign", "striker"]));
    expect(clusterKey("The Millers beat Barnsley")).toEqual(new Set(["beat", "barnsley"]));
  });

  it("splits scorelines into digit tokens", () => {
    expect(clusterKey("Won 2-1")).toEqual(new Set(["won", "2", "1"]));
  });

  it("returns an empty set for a content-free title", () => {
    expect(clusterKey("The Rotherham United")).toEqual(new Set());
  });
});

describe("similarity (Sørensen–Dice)", () => {
  it("is 1 for identical token sets", () => {
    expect(similarity("Council approves budget", "budget council approves")).toBe(1);
  });

  it("is 0 for disjoint headlines", () => {
    expect(similarity("Fire at school", "New café opens")).toBe(0);
  });

  it("is 0 for two content-free titles (never merge nothing with nothing)", () => {
    expect(similarity("Rotherham United", "The Millers")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "Millers beat Barnsley 2-1 in derby";
    const b = "Rotherham United win derby 2-1 against Barnsley";
    expect(similarity(a, b)).toBe(similarity(b, a));
  });

  it("computes the expected coefficient", () => {
    // {fire, station, road} vs {fire, station, closed}: 2*2 / (3+3) = 0.667
    expect(similarity("Fire station road", "Fire station closed")).toBeCloseTo(2 / 3, 5);
  });
});

// The correctness contract: real-shaped Advertiser/Star headline pairs.
describe("sameStory — true positives (must merge at threshold 0.8)", () => {
  const pairs: Array<[string, string]> = [
    [
      "Millers beat Barnsley 2-1 in South Yorkshire derby",
      "Rotherham United win South Yorkshire derby 2-1 against Barnsley",
    ],
    [
      "Man charged after Rotherham town centre stabbing",
      "Man charged following stabbing in Rotherham town centre",
    ],
    [
      "Rotherham Council approves £2m Maltby regeneration plan",
      "Council approves £2m regeneration plan for Maltby",
    ],
    [
      "Fire crews tackle blaze at Rotherham warehouse",
      "Crews tackle warehouse blaze in Rotherham",
    ],
  ];

  it.each(pairs)("merges: %s ≈ %s", (a, b) => {
    expect(similarity(a, b)).toBeGreaterThanOrEqual(CLUSTER_THRESHOLD);
    expect(sameStory(a, b)).toBe(true);
  });
});

describe("sameStory — near-miss true negatives (must NOT merge)", () => {
  const pairs: Array<[string, string]> = [
    // Share local vocabulary but are different stories.
    [
      "Rotherham United sign new striker",
      "Rotherham United sack manager",
    ],
    [
      "Rotherham Council approves budget",
      "Rotherham Council rejects housing plan",
    ],
    [
      "Fire at Maltby school",
      "Flooding at Maltby school",
    ],
    // Same club, totally different match/topic.
    [
      "Millers beat Barnsley 2-1",
      "Millers lose 3-0 to Sheffield Wednesday",
    ],
  ];

  it.each(pairs)("keeps separate: %s ≠ %s", (a, b) => {
    expect(similarity(a, b)).toBeLessThan(CLUSTER_THRESHOLD);
    expect(sameStory(a, b)).toBe(false);
  });
});
