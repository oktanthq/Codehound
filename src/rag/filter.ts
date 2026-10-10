import type { RetrievalHit, RetrievalQuery, Retriever } from "./types.js";
import { filterFromQuery, matchesFilter } from "./vector.js";

export function applyRetrievalFilter(
  hits: readonly RetrievalHit[],
  query: RetrievalQuery,
): RetrievalHit[] {
  const filter = filterFromQuery(query);
  return hits.filter((hit) => matchesFilter(hit.chunk, filter));
}

export class FilteringRetriever implements Retriever {
  constructor(private readonly inner: Retriever) {}

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const limit = query.limit ?? 10;
    const unfiltered = { ...query };
    delete unfiltered.repositoryFullName;
    delete unfiltered.commitSha;
    delete unfiltered.language;
    delete unfiltered.pathPrefix;
    delete unfiltered.symbol;
    delete unfiltered.symbolKind;
    delete unfiltered.chunkKind;
    unfiltered.limit = Math.max(limit * 5, 25);
    const hits = await this.inner.search(unfiltered);
    return applyRetrievalFilter(hits, query).slice(0, limit);
  }
}
