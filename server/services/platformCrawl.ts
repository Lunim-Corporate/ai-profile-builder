import type { CrawledData, SocialLink } from "@shared/schema";
import { buildCrawledDataFromTmdbPersonId, findTmdbPersonIdByImdbId } from "./tmdb";
import { fetchYouTubeChannelForCrawl } from "./youtube";
import { fetchVimeoUserForCrawl } from "./vimeo";

export type PlatformCrawlTarget =
  | { kind: "imdb_person"; imdbId: string }
  | { kind: "tmdb_person"; personId: number }
  | { kind: "youtube_channel"; url: string }
  | { kind: "vimeo_user"; url: string }
  | { kind: "generic" };

const IMDB_PERSON_RE = /imdb\.com\/name\/(nm\d+)/i;
const TMDB_PERSON_RE = /themoviedb\.org\/person\/(\d+)/i;
const YOUTUBE_CHANNEL_RE =
  /youtube\.com\/(?:channel\/|c\/|@|user\/)/i;
const YOUTUBE_VIDEO_RE = /youtube\.com\/watch\?|youtu\.be\//i;
const VIMEO_USER_RE = /vimeo\.com\/(?:user\/)?([a-zA-Z0-9_-]+)/i;
const VIMEO_VIDEO_ONLY_RE = /vimeo\.com\/\d+(?:\?|$|\/)/;

/** Decide whether to use a platform API instead of HTML crawl. */
export function classifyCrawlUrl(url: string): PlatformCrawlTarget {
  const imdbMatch = url.match(IMDB_PERSON_RE);
  if (imdbMatch) {
    return { kind: "imdb_person", imdbId: imdbMatch[1].toLowerCase() };
  }

  const tmdbMatch = url.match(TMDB_PERSON_RE);
  if (tmdbMatch) {
    return { kind: "tmdb_person", personId: parseInt(tmdbMatch[1], 10) };
  }

  if (YOUTUBE_CHANNEL_RE.test(url) && !YOUTUBE_VIDEO_RE.test(url)) {
    return { kind: "youtube_channel", url };
  }

  if (!VIMEO_VIDEO_ONLY_RE.test(url)) {
    const vimeoMatch = url.match(VIMEO_USER_RE);
    if (vimeoMatch) {
      const slug = vimeoMatch[1];
      if (!/^\d+$/.test(slug) && !["videos", "channels", "groups", "showcase"].includes(slug)) {
        return { kind: "vimeo_user", url };
      }
    }
  }

  return { kind: "generic" };
}

export function isApiBackedCrawlTarget(target: PlatformCrawlTarget): boolean {
  return target.kind !== "generic";
}

/** Fetch profile-shaped data via official APIs (no HTML crawl / Puppeteer). */
export async function crawlViaPlatformApi(
  sourceUrl: string,
  target: PlatformCrawlTarget,
): Promise<CrawledData | null> {
  switch (target.kind) {
    case "imdb_person": {
      const personId = await findTmdbPersonIdByImdbId(target.imdbId);
      if (!personId) {
        console.warn(`TMDB find failed for IMDb person ${target.imdbId}`);
        return null;
      }
      return buildCrawledDataFromTmdbPersonId(personId, sourceUrl, {
        imdbProfileUrl: `https://www.imdb.com/name/${target.imdbId}/`,
      });
    }
    case "tmdb_person":
      return buildCrawledDataFromTmdbPersonId(target.personId, sourceUrl);
    case "youtube_channel":
      return fetchYouTubeChannelForCrawl(target.url);
    case "vimeo_user":
      return fetchVimeoUserForCrawl(target.url);
    default:
      return null;
  }
}
