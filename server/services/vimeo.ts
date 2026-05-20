import axios from "axios";
import type { CrawledData } from "@shared/schema";

export interface VimeoVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  createdAt: string;
}

export async function getVimeoThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const response = await axios.get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 5000
    });
    
    if (response.data?.thumbnail_url) {
      return response.data.thumbnail_url;
    }
    return null;
  } catch (error) {
    console.log("Vimeo oEmbed error for:", videoUrl);
    return null;
  }
}

export function isVimeoUrl(url: string): boolean {
  return url.includes('vimeo.com');
}

export function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

export function extractVimeoUsername(url: string): string | null {
  // Matches vimeo.com/username or vimeo.com/user/username
  const userMatch = url.match(/vimeo\.com\/(?:user\/)?([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (userMatch) {
    const username = userMatch[1];
    // Exclude numeric IDs (those are video IDs, not usernames)
    if (!/^\d+$/.test(username) && !['videos', 'channels', 'groups'].includes(username)) {
      return username;
    }
  }
  return null;
}

/** Build CrawledData from Vimeo API for user profile URLs. */
export async function fetchVimeoUserForCrawl(vimeoUrl: string): Promise<CrawledData | null> {
  const apiKey = process.env.VIMEO_API_KEY;
  if (!apiKey) {
    console.warn("VIMEO_API_KEY not configured, skipping Vimeo platform crawl");
    return null;
  }

  const username = extractVimeoUsername(vimeoUrl);
  if (!username) {
    return null;
  }

  try {
    const userResponse = await axios.get(
      `https://api.vimeo.com/users/${username}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const user = userResponse.data;
    const name = user.name || username;
    const bio = (user.bio || "").trim();
    const link = user.link || `https://vimeo.com/${username}`;
    const thumbnail =
      user.pictures?.sizes?.[3]?.link ||
      user.pictures?.sizes?.[2]?.link ||
      user.pictures?.sizes?.[1]?.link ||
      null;

    const videos = await fetchVimeoUserVideos(vimeoUrl);
    const videoLines = videos
      .slice(0, 20)
      .map((v) => `${v.title} (${formatVimeoDate(v.createdAt)}) — ${v.url}`);

    const textParts = [
      bio,
      videoLines.length > 0 ? `Recent videos:\n${videoLines.join("\n")}` : "",
    ].filter(Boolean);

    return {
      url: vimeoUrl,
      title: name,
      description: bio.slice(0, 500) || undefined,
      images: thumbnail ? [thumbnail] : [],
      links: videos.map((v) => v.url),
      socialLinks: [{ platform: "vimeo", url: link }],
      textContent: textParts.join("\n\n").slice(0, 10000),
      metadata: { _crawlSource: "vimeo_api", vimeo_username: username },
      videoUrls: videos.map((v) => v.url),
    };
  } catch (error: unknown) {
    console.error("Vimeo platform crawl error:", error);
    return null;
  }
}

export async function fetchVimeoUserVideos(vimeoUrl: string): Promise<VimeoVideo[]> {
  const apiKey = process.env.VIMEO_API_KEY;
  
  if (!apiKey) {
    console.log("VIMEO_API_KEY not configured, skipping Vimeo video fetch");
    return [];
  }

  try {
    const username = extractVimeoUsername(vimeoUrl);
    if (!username) {
      console.log("Could not extract Vimeo username from URL:", vimeoUrl);
      return [];
    }

    // Fetch user videos using Vimeo API
    const response = await axios.get(
      `https://api.vimeo.com/users/${username}/videos`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        params: {
          per_page: 20,
          sort: 'date',
          direction: 'desc',
        },
        timeout: 10000,
      }
    );

    const videos: VimeoVideo[] = response.data.data.map((video: any) => ({
      id: video.uri.split('/').pop(),
      title: video.name || 'Untitled',
      description: video.description?.slice(0, 200) || '',
      thumbnail: video.pictures?.sizes?.[3]?.link || 
                 video.pictures?.sizes?.[2]?.link ||
                 video.pictures?.sizes?.[1]?.link || '',
      url: video.link,
      createdAt: video.created_time,
    }));

    console.log(`Fetched ${videos.length} videos from Vimeo user: ${username}`);
    return videos;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("Vimeo user not found:", vimeoUrl);
    } else {
      console.error("Vimeo API error:", error.message || error);
    }
    return [];
  }
}

export function formatVimeoDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export interface VimeoSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  duration?: number;
  isTrailer: boolean;
}

export async function searchVimeoForProject(
  projectTitle: string,
  projectType: "short" | "feature" | "trailer"
): Promise<VimeoSearchResult | null> {
  const apiKey = process.env.VIMEO_API_KEY;
  
  if (!apiKey) {
    console.log("Vimeo API key not configured for search");
    return null;
  }

  try {
    const searchQueries = projectType === "short" 
      ? [`${projectTitle} short film`, `${projectTitle} short`]
      : [`${projectTitle} trailer`, `${projectTitle} official trailer`];

    for (const query of searchQueries) {
      const response = await axios.get(
        `https://api.vimeo.com/videos`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          params: {
            query: query,
            per_page: 5,
            sort: 'relevant',
          },
          timeout: 10000,
        }
      );

      if (response.data.data?.length > 0) {
        const items = response.data.data;
        
        for (const item of items) {
          const title = item.name.toLowerCase();
          const projectLower = projectTitle.toLowerCase();
          
          if (title.includes(projectLower) || 
              projectLower.split(' ').some((word: string) => word.length > 3 && title.includes(word))) {
            console.log(`Found Vimeo video for "${projectTitle}": ${item.name}`);
            return {
              videoId: item.uri.split('/').pop(),
              title: item.name,
              thumbnail: item.pictures?.sizes?.[3]?.link || 
                        item.pictures?.sizes?.[2]?.link || "",
              url: item.link,
              duration: item.duration,
              isTrailer: projectType === "trailer" || projectType === "feature",
            };
          }
        }
      }
    }

    console.log(`No Vimeo video found for: ${projectTitle}`);
    return null;
  } catch (error: any) {
    console.error("Vimeo search error:", error.message || error);
    return null;
  }
}
