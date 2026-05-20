import type { Platform, SocialLink } from "@shared/schema";
import { detectPlatform } from "./crawler";

/** Map Perplexity JSON `profile_urls` keys → platform enum. */
const PROFILE_URL_FIELD_MAP: Array<{ jsonKey: string; platform: Platform }> = [
  { jsonKey: "imdb", platform: "imdb" },
  { jsonKey: "tmdb", platform: "tmdb" },
  { jsonKey: "youtube", platform: "youtube" },
  { jsonKey: "vimeo", platform: "vimeo" },
  { jsonKey: "linkedin", platform: "linkedin" },
  { jsonKey: "facebook", platform: "facebook" },
  { jsonKey: "twitter", platform: "twitter" },
  { jsonKey: "instagram", platform: "instagram" },
  { jsonKey: "website", platform: "website" },
];

export function socialLinksFromProfileUrlRecord(
  record: Record<string, unknown> | null | undefined,
): SocialLink[] {
  if (!record || typeof record !== "object") return [];
  const out: SocialLink[] = [];
  for (const { jsonKey, platform } of PROFILE_URL_FIELD_MAP) {
    const v = record[jsonKey];
    if (typeof v !== "string" || !/^https?:\/\//i.test(v)) continue;
    try {
      out.push({ platform, url: new URL(v).href });
    } catch {
      continue;
    }
  }
  return out;
}

/** Loose URL capture for prose / markdown research text (Perplexity, etc.). */
const BARE_URL_RE = /https?:\/\/[^\s\]<>'"»]+/gi;
const MARKDOWN_LINK_RE = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;'"»]+$/u, "");
}

export function mergeSocialLinks(primary: SocialLink[], secondary: SocialLink[]): SocialLink[] {
  const seen = new Set(primary.map((l) => l.platform));
  const out = [...primary];
  for (const link of secondary) {
    if (!seen.has(link.platform)) {
      seen.add(link.platform);
      out.push(link);
    }
  }
  return out;
}

/**
 * Pull recognizable social / platform URLs out of free-form text and dedupe by platform
 * (first occurrence wins), matching crawler behavior.
 */
export function extractSocialLinksFromText(text: string): SocialLink[] {
  if (!text.trim()) return [];

  const candidates: string[] = [];
  for (const re of [BARE_URL_RE, MARKDOWN_LINK_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1] ?? m[0];
      candidates.push(trimTrailingPunctuation(raw));
    }
  }

  const byPlatform = new Map<SocialLink["platform"], string>();

  for (const raw of candidates) {
    try {
      const normalized = new URL(raw).href;
      const platform = detectPlatform(normalized);
      if (platform === "website") continue;
      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, normalized);
      }
    } catch {
      continue;
    }
  }

  return Array.from(byPlatform.entries()).map(([platform, url]) => ({ platform, url }));
}
