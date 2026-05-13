import type { CrawledData } from "@shared/schema";

const DEFAULT_MAX = 25_000;

const BANNER =
  "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function truncateForDebug(value: string, max = DEFAULT_MAX): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]`;
}

/** Pretty-print one pipeline stage to stdout when PROFILE_PIPELINE_DEBUG is on. */
export function logPipelineStage(title: string, payload: unknown): void {
  console.log(`${BANNER}\n[profile-pipeline-debug] ${title}${BANNER}`);
  try {
    console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
  } catch {
    console.log(String(payload));
  }
}

/** Safe crawl snapshot for logs (large fields truncated). */
export function summarizeCrawledForDebug(data: CrawledData, textMax = 15_000, linksMax = 80) {
  return {
    url: data.url,
    title: data.title,
    description: data.description,
    textLength: data.textContent.length,
    textContent: truncateForDebug(data.textContent, textMax),
    linkCount: data.links.length,
    linksSample: data.links.slice(0, linksMax),
    imageCount: data.images.length,
    imagesSample: data.images.slice(0, 25),
    socialLinks: data.socialLinks,
    videoUrls: data.videoUrls ?? [],
    metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
  };
}
