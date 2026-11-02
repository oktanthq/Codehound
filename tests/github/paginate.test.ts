import { describe, expect, it } from "vitest";
import { hasNextLink, paginate } from "../../src/github/paginate.js";

describe("hasNextLink", () => {
  it("detects a next relation in GitHub Link headers", () => {
    expect(
      hasNextLink({
        link: '<https://api.github.com/resource?page=2>; rel="next", <https://api.github.com/resource?page=5>; rel="last"',
      }),
    ).toBe(true);
    expect(hasNextLink({ link: '<https://api.github.com/resource?page=1>; rel="prev"' })).toBe(
      false,
    );
    expect(hasNextLink({ "content-type": "application/json" })).toBeUndefined();
    expect(hasNextLink(undefined)).toBeUndefined();
  });
});

describe("paginate", () => {
  it("collects every item across a short final page", async () => {
    const result = await paginate({
      pageSize: 100,
      fetchPage: async (page) => {
        if (page === 1) {
          return { items: Array.from({ length: 100 }, (_, index) => index) };
        }
        if (page === 2) {
          return { items: Array.from({ length: 30 }, (_, index) => 100 + index) };
        }
        throw new Error(`unexpected page ${page}`);
      },
    });
    expect(result.items).toHaveLength(130);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("follows Link rel=next and stops when it is absent", async () => {
    const result = await paginate({
      pageSize: 2,
      fetchPage: async (page) => {
        if (page === 1) {
          return {
            items: [1, 2],
            headers: { link: '<https://example.com?page=2>; rel="next"' },
          };
        }
        return {
          items: [3, 4],
          headers: { link: '<https://example.com?page=1>; rel="prev"' },
        };
      },
    });
    expect(result.items).toEqual([1, 2, 3, 4]);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("stops after maxPages when every page is full", async () => {
    let calls = 0;
    const result = await paginate({
      pageSize: 2,
      maxPages: 3,
      fetchPage: async () => {
        calls += 1;
        return { items: [1, 2] };
      },
    });
    expect(calls).toBe(3);
    expect(result.items).toHaveLength(6);
    expect(result.truncated).toBe(true);
  });

  it("marks a result truncated when the item cap is reached", async () => {
    const result = await paginate({
      pageSize: 100,
      maxPages: 30,
      maxItems: 3000,
      fetchPage: async (page) => ({
        items: Array.from({ length: 100 }, (_, index) => (page - 1) * 100 + index),
      }),
    });
    expect(result.items).toHaveLength(3000);
    expect(result.pages).toBe(30);
    expect(result.truncated).toBe(true);
  });

  it("honors done to stop mid-list", async () => {
    let calls = 0;
    const result = await paginate({
      pageSize: 2,
      fetchPage: async (page) => {
        calls += 1;
        return { items: [page * 2 - 1, page * 2], done: page === 1 };
      },
    });
    expect(calls).toBe(1);
    expect(result.items).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
  });
});
