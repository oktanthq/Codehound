import type { GitHubApp } from "../github/app.js";
import type { RepositoryAuthorizer } from "../github/authz.js";
import { parseRepositoryFullName } from "../github/types.js";
import type { ReviewComment } from "./comments.js";
import type { ReviewReport } from "./engine.js";
import type { IngestedPull } from "./types.js";

export type PublishedReview = {
  id: number;
  htmlUrl: string;
  event: string;
  commentCount: number;
};

type GitHubReviewResponse = {
  id?: number;
  html_url?: string;
};

function githubComments(comments: readonly ReviewComment[]): {
  path: string;
  body: string;
  line: number;
  side: "RIGHT";
}[] {
  return comments.flatMap((comment) => {
    if (comment.line === undefined || comment.line < 1) {
      return [];
    }
    return [{ path: comment.path, body: comment.body, line: comment.line, side: "RIGHT" as const }];
  });
}

export class GitHubReviewPublisher {
  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
  ) {}

  async publish(pull: IngestedPull, report: ReviewReport): Promise<PublishedReview> {
    const { owner, name } = parseRepositoryFullName(pull.pull.fullName);
    await this.authorizer.assertAuthorized({
      installationId: pull.installationId,
      owner,
      repo: name,
      requiredPermissions: { pull_requests: "write", metadata: "read" },
    });
    const inline = githubComments(report.comments);
    const result = await this.app.requestAsInstallation<GitHubReviewResponse>(pull.installationId, {
      method: "POST",
      path: `/repos/${owner}/${name}/pulls/${pull.pull.number}/reviews`,
      body: {
        commit_id: pull.pull.headSha,
        body: report.summary.body,
        event: report.summary.event,
        comments: inline,
      },
    });
    return {
      id: result.data.id ?? 0,
      htmlUrl: result.data.html_url ?? pull.pull.htmlUrl,
      event: report.summary.event,
      commentCount: inline.length,
    };
  }
}
