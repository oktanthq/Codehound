export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGES = 100;

export type PagedResponse<T> = {
  items: T[];
  headers?: Record<string, string>;
  totalCount?: number;
  done?: boolean;
};

export type PaginateOptions<T> = {
  pageSize?: number;
  maxPages?: number;
  maxItems?: number;
  fetchPage: (page: number, pageSize: number) => Promise<PagedResponse<T>>;
};

export type PaginateResult<T> = {
  items: T[];
  pages: number;
  truncated: boolean;
};

const NEXT_LINK = /<[^>]+>;\s*rel=["']?next["']?/i;

export function hasNextLink(headers: Record<string, string> | undefined): boolean | undefined {
  if (headers === undefined) {
    return undefined;
  }
  const link = headers.link ?? headers.Link;
  if (link === undefined) {
    return undefined;
  }
  return NEXT_LINK.test(link);
}

export async function paginate<T>(options: PaginateOptions<T>): Promise<PaginateResult<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const maxItems = options.maxItems;
  const items: T[] = [];
  let truncated = false;
  let pages = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await options.fetchPage(page, pageSize);
    pages = page;
    const batch = response.items;
    const remaining = maxItems === undefined ? batch.length : Math.max(0, maxItems - items.length);
    items.push(...batch.slice(0, remaining));

    const hitItemCap = maxItems !== undefined && items.length >= maxItems;
    const shortPage = batch.length === 0 || batch.length < pageSize;
    const nextLink = hasNextLink(response.headers);
    const reachedTotal = response.totalCount !== undefined && items.length >= response.totalCount;
    const finished = response.done === true;
    const moreAvailable = !shortPage && nextLink !== false;

    if (finished || shortPage || nextLink === false || reachedTotal || hitItemCap) {
      truncated = hitItemCap || (page === maxPages && moreAvailable);
      break;
    }

    if (page === maxPages) {
      truncated = moreAvailable;
    }
  }

  return { items, pages, truncated };
}
