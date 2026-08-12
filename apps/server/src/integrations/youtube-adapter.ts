import {
  IntegrationError,
  httpIntegrationError,
  normalizeFetchError,
  readErrorType,
} from "./integration-error.js";

export interface YouTubeAdapterOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface YouTubeVideo {
  readonly videoId: string;
  readonly title: string;
  readonly channelId: string;
  readonly channelTitle: string;
  readonly publishedAt: string;
  readonly commentCount?: number;
}

export interface YouTubeComment {
  readonly commentId: string;
  readonly parentCommentId: string | null;
  readonly author: string;
  readonly text: string;
  readonly likes: number;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly isReply: boolean;
}

export interface YouTubeThread {
  readonly threadId: string;
  readonly topLevelComment: YouTubeComment;
  readonly totalReplyCount: number;
  readonly embeddedReplies: readonly YouTubeComment[];
}

export interface YouTubePage<T> {
  readonly items: readonly T[];
  readonly nextPageToken?: string;
}

interface YouTubeListResponse {
  items?: unknown;
  nextPageToken?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new IntegrationError("invalid_response", `YouTube omitió el campo ${field}.`);
  }
  return value;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function mapComment(value: unknown, parentCommentId: string | null): YouTubeComment {
  if (typeof value !== "object" || value === null) throw new IntegrationError("invalid_response", "YouTube devolvió un comentario inválido.");
  const item = value as { id?: unknown; snippet?: Record<string, unknown> };
  const snippet = item.snippet;
  if (typeof snippet !== "object" || snippet === null) throw new IntegrationError("invalid_response", "YouTube omitió los datos del comentario.");
  return {
    commentId: requiredString(item.id, "comment.id"),
    parentCommentId,
    author: typeof snippet.authorDisplayName === "string" ? snippet.authorDisplayName : "Autor desconocido",
    text: requiredString(snippet.textOriginal ?? snippet.textDisplay, "comment.text"),
    likes: count(snippet.likeCount),
    publishedAt: requiredString(snippet.publishedAt, "comment.publishedAt"),
    updatedAt: requiredString(snippet.updatedAt ?? snippet.publishedAt, "comment.updatedAt"),
    isReply: parentCommentId !== null,
  };
}

export function extractYouTubeVideoId(input: string): string | undefined {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return /^[\w-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : undefined;
    if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) {
      const candidate = url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
      return candidate !== null && candidate !== undefined && /^[\w-]{11}$/.test(candidate) ? candidate : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class YouTubeAdapter {
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor(options: YouTubeAdapterOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get configured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async getVideo(videoId: string): Promise<YouTubeVideo | undefined> {
    const response = await this.get("videos", { part: "snippet,statistics", id: videoId });
    const item = Array.isArray(response.items) ? response.items[0] : undefined;
    if (item === undefined) return undefined;
    if (typeof item !== "object" || item === null) throw new IntegrationError("invalid_response", "YouTube devolvió un video inválido.");
    const video = item as { id?: unknown; snippet?: Record<string, unknown>; statistics?: Record<string, unknown> };
    const snippet = video.snippet;
    if (typeof snippet !== "object" || snippet === null) throw new IntegrationError("invalid_response", "YouTube omitió la metadata del video.");
    return {
      videoId: requiredString(video.id, "video.id"),
      title: requiredString(snippet.title, "video.title"),
      channelId: requiredString(snippet.channelId, "video.channelId"),
      channelTitle: requiredString(snippet.channelTitle, "video.channelTitle"),
      publishedAt: requiredString(snippet.publishedAt, "video.publishedAt"),
      ...(video.statistics?.commentCount === undefined ? {} : { commentCount: count(video.statistics.commentCount) }),
    };
  }

  async listCommentThreads(input: { videoId: string; pageToken?: string; maxResults?: number; order?: "relevance" | "time" }): Promise<YouTubePage<YouTubeThread>> {
    const response = await this.get("commentThreads", {
      part: "snippet,replies",
      videoId: input.videoId,
      maxResults: String(Math.min(100, Math.max(1, input.maxResults ?? 100))),
      order: input.order ?? "relevance",
      ...(input.pageToken === undefined ? {} : { pageToken: input.pageToken }),
      textFormat: "plainText",
    });
    const items = Array.isArray(response.items) ? response.items : [];
    return {
      items: items.map((raw): YouTubeThread => {
        if (typeof raw !== "object" || raw === null) throw new IntegrationError("invalid_response", "YouTube devolvió un hilo inválido.");
        const item = raw as { id?: unknown; snippet?: Record<string, unknown>; replies?: { comments?: unknown } };
        const snippet = item.snippet;
        if (typeof snippet !== "object" || snippet === null) throw new IntegrationError("invalid_response", "YouTube omitió los datos del hilo.");
        const topRaw = snippet.topLevelComment;
        const top = mapComment(topRaw, null);
        const replyItems = Array.isArray(item.replies?.comments) ? item.replies.comments : [];
        return {
          threadId: requiredString(item.id, "thread.id"),
          topLevelComment: top,
          totalReplyCount: count(snippet.totalReplyCount),
          embeddedReplies: replyItems.map((reply) => mapComment(reply, top.commentId)),
        };
      }),
      ...(typeof response.nextPageToken === "string" ? { nextPageToken: response.nextPageToken } : {}),
    };
  }

  async listReplies(input: { parentCommentId: string; pageToken?: string; maxResults?: number }): Promise<YouTubePage<YouTubeComment>> {
    const response = await this.get("comments", {
      part: "snippet",
      parentId: input.parentCommentId,
      maxResults: String(Math.min(100, Math.max(1, input.maxResults ?? 100))),
      ...(input.pageToken === undefined ? {} : { pageToken: input.pageToken }),
      textFormat: "plainText",
    });
    return {
      items: (Array.isArray(response.items) ? response.items : []).map((item) => mapComment(item, input.parentCommentId)),
      ...(typeof response.nextPageToken === "string" ? { nextPageToken: response.nextPageToken } : {}),
    };
  }

  private async get(resource: string, parameters: Readonly<Record<string, string>>): Promise<YouTubeListResponse> {
    if (!this.configured) throw new IntegrationError("missing_api_key", "YouTube no está configurado.");
    const url = new URL(`${this.baseUrl}/${resource}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    url.searchParams.set("key", this.apiKey!);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (error) {
      throw normalizeFetchError(error, "YouTube");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw httpIntegrationError("YouTube", response.status, await readErrorType(response));
    try {
      return await response.json() as YouTubeListResponse;
    } catch (error) {
      throw new IntegrationError("invalid_response", "YouTube devolvió una respuesta que no es JSON.", { cause: error });
    }
  }
}
