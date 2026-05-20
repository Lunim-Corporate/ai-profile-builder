import axios from "axios";
import type { CrawledData } from "@shared/schema";

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  url: string;
}

interface YouTubeChannelInfo {
  channelId: string;
  channelTitle: string;
  videos: YouTubeVideo[];
}

function extractChannelId(url: string): string | null {
  const patterns = [
    /youtube\.com\/channel\/([^/?]+)/,
    /youtube\.com\/c\/([^/?]+)/,
    /youtube\.com\/@([^/?]+)/,
    /youtube\.com\/user\/([^/?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function resolveChannelId(channelUrl: string, apiKey: string): Promise<{
  channelId: string;
  title: string;
  description: string;
  thumbnail: string | null;
} | null> {
  const channelIdentifier = extractChannelId(channelUrl);
  if (!channelIdentifier) {
    return null;
  }

  let channelId = channelIdentifier;

  if (channelUrl.includes("/@") || channelUrl.includes("/c/") || channelUrl.includes("/user/")) {
    const searchResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`,
      {
        params: {
          part: "snippet",
          type: "channel",
          q: channelIdentifier,
          key: apiKey,
          maxResults: 1,
        },
      },
    );

    if (!searchResponse.data.items?.length) {
      return null;
    }
    channelId = searchResponse.data.items[0].id.channelId;
  }

  const channelResponse = await axios.get(
    `https://www.googleapis.com/youtube/v3/channels`,
    {
      params: {
        part: "snippet,contentDetails",
        id: channelId,
        key: apiKey,
      },
    },
  );

  if (!channelResponse.data.items?.length) {
    return null;
  }

  const snippet = channelResponse.data.items[0].snippet;
  return {
    channelId,
    title: snippet.title || "",
    description: snippet.description || "",
    thumbnail:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      null,
  };
}

/** Build CrawledData from YouTube Data API for channel profile URLs. */
export async function fetchYouTubeChannelForCrawl(channelUrl: string): Promise<CrawledData | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("YOUTUBE_API_KEY not configured, skipping YouTube platform crawl");
    return null;
  }

  try {
    const channel = await resolveChannelId(channelUrl, apiKey);
    if (!channel) {
      console.log("Could not resolve YouTube channel:", channelUrl);
      return null;
    }

    const videos = await fetchChannelVideos(channelUrl);
    const videoLines = videos
      .slice(0, 20)
      .map((v) => `${v.title} (${formatYouTubeDate(v.publishedAt)}) — ${v.url}`);

    const canonicalUrl =
      channelUrl.includes("/channel/") || channelUrl.includes("/@")
        ? channelUrl
        : `https://www.youtube.com/channel/${channel.channelId}`;

    const textParts = [
      channel.description.trim(),
      videoLines.length > 0 ? `Recent videos:\n${videoLines.join("\n")}` : "",
    ].filter(Boolean);

    return {
      url: channelUrl,
      title: channel.title,
      description: channel.description.slice(0, 500) || undefined,
      images: channel.thumbnail ? [channel.thumbnail] : [],
      links: videos.map((v) => v.url),
      socialLinks: [{ platform: "youtube", url: canonicalUrl }],
      textContent: textParts.join("\n\n").slice(0, 10000),
      metadata: { _crawlSource: "youtube_api", youtube_channel_id: channel.channelId },
      videoUrls: videos.map((v) => v.url),
    };
  } catch (error) {
    console.error("YouTube platform crawl error:", error);
    return null;
  }
}

export async function fetchChannelVideos(channelUrl: string): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.log("YouTube API key not configured");
    return [];
  }

  try {
    const channelIdentifier = extractChannelId(channelUrl);
    if (!channelIdentifier) {
      console.log("Could not extract channel identifier from URL:", channelUrl);
      return [];
    }

    let channelId = channelIdentifier;

    if (channelUrl.includes("/@") || channelUrl.includes("/c/") || channelUrl.includes("/user/")) {
      const searchResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search`,
        {
          params: {
            part: "snippet",
            type: "channel",
            q: channelIdentifier,
            key: apiKey,
            maxResults: 1,
          },
        }
      );

      if (searchResponse.data.items?.length > 0) {
        channelId = searchResponse.data.items[0].id.channelId;
      } else {
        console.log("Could not find channel for:", channelIdentifier);
        return [];
      }
    }

    const channelResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels`,
      {
        params: {
          part: "contentDetails",
          id: channelId,
          key: apiKey,
        },
      }
    );

    if (!channelResponse.data.items?.length) {
      console.log("Channel not found:", channelId);
      return [];
    }

    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

    const videosResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/playlistItems`,
      {
        params: {
          part: "snippet",
          playlistId: uploadsPlaylistId,
          key: apiKey,
          maxResults: 20,
        },
      }
    );

    const videos: YouTubeVideo[] = videosResponse.data.items.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description?.slice(0, 200) || "",
      thumbnail: item.snippet.thumbnails?.high?.url || 
                 item.snippet.thumbnails?.medium?.url || 
                 item.snippet.thumbnails?.default?.url || "",
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
    }));

    console.log(`Fetched ${videos.length} videos from YouTube channel`);
    return videos;
  } catch (error) {
    console.error("YouTube API error:", error);
    return [];
  }
}

export function formatYouTubeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  duration?: string;
  isTrailer: boolean;
}

export async function searchYouTubeForProject(
  projectTitle: string,
  projectType: "short" | "feature" | "trailer"
): Promise<YouTubeSearchResult | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.log("YouTube API key not configured for search");
    return null;
  }

  try {
    const searchQueries = projectType === "short" 
      ? [`${projectTitle} short film full`, `${projectTitle} short film`, `${projectTitle} full film`]
      : [`${projectTitle} official trailer`, `${projectTitle} trailer`, `${projectTitle} movie trailer`];

    for (const query of searchQueries) {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/search`,
        {
          params: {
            part: "snippet",
            type: "video",
            q: query,
            key: apiKey,
            maxResults: 5,
            videoDuration: projectType === "short" ? "medium" : "short",
          },
        }
      );

      if (response.data.items?.length > 0) {
        const items = response.data.items;
        
        for (const item of items) {
          const title = item.snippet.title.toLowerCase();
          const projectLower = projectTitle.toLowerCase();
          
          if (title.includes(projectLower) || 
              projectLower.split(' ').some((word: string) => word.length > 3 && title.includes(word))) {
            console.log(`Found YouTube video for "${projectTitle}": ${item.snippet.title}`);
            return {
              videoId: item.id.videoId,
              title: item.snippet.title,
              thumbnail: item.snippet.thumbnails?.high?.url || 
                        item.snippet.thumbnails?.medium?.url || "",
              url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
              isTrailer: projectType === "trailer" || projectType === "feature",
            };
          }
        }
      }
    }

    console.log(`No YouTube video found for: ${projectTitle}`);
    return null;
  } catch (error) {
    console.error("YouTube search error:", error);
    return null;
  }
}
