import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import type { CrawledData, SocialLink, Platform } from "@shared/schema";

const PLATFORM_PATTERNS: Record<Platform, RegExp> = {
  imdb: /imdb\.com/i,
  tmdb: /themoviedb\.org/i,
  omdb: /omdbapi\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
  vimeo: /vimeo\.com/i,
  linkedin: /linkedin\.com/i,
  facebook: /facebook\.com/i,
  website: /.*/,
};

function detectPlatform(url: string): Platform {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (platform !== "website" && pattern.test(url)) {
      return platform as Platform;
    }
  }
  return "website";
}

function extractSocialLinks(links: string[]): SocialLink[] {
  const socialLinks: SocialLink[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    try {
      const url = new URL(link);
      const platform = detectPlatform(link);
      
      if (platform !== "website" && !seen.has(platform)) {
        seen.add(platform);
        socialLinks.push({ platform, url: link });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return socialLinks;
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const images: string[] = [];
  
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        const absoluteUrl = new URL(src, baseUrl).href;
        if (!absoluteUrl.includes("data:") && !absoluteUrl.includes(".svg")) {
          images.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });

  // Also check og:image meta tag
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    try {
      images.unshift(new URL(ogImage, baseUrl).href);
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(new Set(images)).slice(0, 20);
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];
  
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        links.push(absoluteUrl);
      } catch {
        // Invalid URL, skip
      }
    }
  });

  return Array.from(new Set(links));
}

function extractVideoUrls($: cheerio.CheerioAPI, links: string[]): string[] {
  const videoUrls: string[] = [];
  const videoPatterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  // Check all links for video URLs
  for (const link of links) {
    for (const pattern of videoPatterns) {
      if (pattern.test(link)) {
        videoUrls.push(link);
        break;
      }
    }
  }

  // Check iframes for embedded videos
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src) {
      for (const pattern of videoPatterns) {
        if (pattern.test(src)) {
          videoUrls.push(src);
          break;
        }
      }
    }
  });

  // Check video elements and data attributes
  $("[data-video-url], [data-vimeo-url], [data-youtube-url]").each((_, el) => {
    const videoUrl = $(el).attr("data-video-url") || $(el).attr("data-vimeo-url") || $(el).attr("data-youtube-url");
    if (videoUrl) {
      videoUrls.push(videoUrl);
    }
  });

  return Array.from(new Set(videoUrls));
}

function extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Open Graph metadata
  $("meta[property^='og:']").each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) {
      metadata[property] = content;
    }
  });

  // Twitter card metadata
  $("meta[name^='twitter:']").each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) {
      metadata[name] = content;
    }
  });

  // Standard meta tags
  $("meta[name]").each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content && !name.startsWith("twitter:")) {
      metadata[name] = content;
    }
  });

  return metadata;
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim()
    .slice(0, 10000); // Limit text content
}

// Puppeteer-based extraction for JavaScript-rendered pages
async function extractVideoUrlsWithPuppeteer(url: string): Promise<string[]> {
  let browser = null;
  const videoUrls: string[] = [];
  
  const videoPatterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];

  try {
    console.log("Launching Puppeteer for JavaScript-rendered content...");
    
    // Determine Chromium executable path with multiple fallbacks
    const getChromiumPath = (): string | undefined => {
      // 1. Explicit environment variable
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      // 2. Try Puppeteer's bundled Chromium
      try {
        const bundledPath = puppeteer.executablePath();
        if (bundledPath) return bundledPath;
      } catch {
        // Bundled Chromium not available
      }
      // 3. Nix-specific path (Replit environment)
      const nixPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
      try {
        const fs = require('fs');
        if (fs.existsSync(nixPath)) return nixPath;
      } catch {
        // Path doesn't exist
      }
      // 4. Let Puppeteer try its default
      return undefined;
    };

    const executablePath = getChromiumPath();
    console.log(`Using Chromium at: ${executablePath || 'default'}`);

    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath && { executablePath }),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    
    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate and wait for network to be mostly idle
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait a bit more for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract all video URLs from the rendered page
    const extractedUrls = await page.evaluate(() => {
      const urls: string[] = [];
      
      // Check all iframes
      document.querySelectorAll('iframe').forEach(iframe => {
        const src = iframe.src || iframe.getAttribute('data-src') || '';
        if (src) urls.push(src);
      });
      
      // Check all anchor tags
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        if (href) urls.push(href);
      });
      
      // Check elements with video-related data attributes
      document.querySelectorAll('[data-video-url], [data-vimeo-url], [data-youtube-url], [data-src]').forEach(el => {
        const videoUrl = el.getAttribute('data-video-url') || 
                         el.getAttribute('data-vimeo-url') || 
                         el.getAttribute('data-youtube-url') ||
                         el.getAttribute('data-src') || '';
        if (videoUrl) urls.push(videoUrl);
      });
      
      // Check video elements
      document.querySelectorAll('video').forEach(video => {
        const src = video.src || video.getAttribute('data-src') || '';
        if (src) urls.push(src);
        
        // Check source elements inside video
        video.querySelectorAll('source').forEach(source => {
          const sourceSrc = source.src || source.getAttribute('data-src') || '';
          if (sourceSrc) urls.push(sourceSrc);
        });
      });
      
      // Check for Vimeo/YouTube players that might be loaded dynamically
      document.querySelectorAll('[class*="vimeo"], [class*="youtube"], [id*="vimeo"], [id*="youtube"]').forEach(el => {
        // Get all attributes that might contain URLs
        for (const attr of el.attributes) {
          if (attr.value.includes('vimeo.com') || attr.value.includes('youtube.com') || attr.value.includes('youtu.be')) {
            urls.push(attr.value);
          }
        }
      });

      // Also search in inline scripts for video URLs
      document.querySelectorAll('script').forEach(script => {
        const content = script.textContent || '';
        // Look for Vimeo video IDs in script content
        const vimeoMatches = content.match(/vimeo\.com\/(?:video\/)?(\d+)/g);
        if (vimeoMatches) {
          vimeoMatches.forEach(match => urls.push('https://' + match));
        }
        // Look for YouTube video IDs
        const youtubeMatches = content.match(/youtube\.com\/embed\/([^"'\s]+)/g);
        if (youtubeMatches) {
          youtubeMatches.forEach(match => urls.push('https://' + match));
        }
      });
      
      return urls;
    });

    // Filter for valid video URLs
    for (const foundUrl of extractedUrls) {
      for (const pattern of videoPatterns) {
        if (pattern.test(foundUrl)) {
          videoUrls.push(foundUrl);
          break;
        }
      }
    }

    console.log(`Puppeteer found ${videoUrls.length} video URLs`);
    
  } catch (error) {
    console.error("Puppeteer extraction error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return Array.from(new Set(videoUrls));
}

/**
 * True when the crawler extracted enough real page content to justify building a profile.
 * Failed HTTP crawls and empty SPAs yield false so we do not persist placeholder profiles.
 */
export function crawlHasUsableContent(data: CrawledData): boolean {
  const text = data.textContent.trim();
  const title = data.title?.trim() ?? "";
  const desc = data.description?.trim() ?? "";

  if (text.length >= 120) return true;
  if (data.socialLinks.length > 0) return true;
  if (data.images.length >= 1 && (text.length >= 40 || desc.length >= 40)) return true;
  if (title.length >= 3 && (text.length >= 40 || desc.length >= 20)) return true;
  if (data.links.length >= 5 && text.length >= 30) return true;

  return false;
}

export async function crawlUrl(url: string): Promise<CrawledData> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AutoProfileBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    const title = $("title").text().trim() || 
                  $('meta[property="og:title"]').attr("content") || 
                  undefined;
    
    const description = $('meta[name="description"]').attr("content") || 
                        $('meta[property="og:description"]').attr("content") || 
                        undefined;

    const images = extractImages($, url);
    const links = extractLinks($, url);
    const socialLinks = extractSocialLinks(links);
    const metadata = extractMetadata($);
    let videoUrls = extractVideoUrls($, links);

    // If no video URLs found with Cheerio, try Puppeteer for JavaScript-rendered content
    if (videoUrls.length === 0) {
      console.log("No videos found with Cheerio, trying Puppeteer...");
      const puppeteerVideos = await extractVideoUrlsWithPuppeteer(url);
      videoUrls = [...new Set([...videoUrls, ...puppeteerVideos])];
    }

    // Remove script and style elements for text extraction
    $("script, style, noscript, iframe").remove();

    // Extract main text content
    const textContent = cleanText($("body").text());

    return {
      url,
      title,
      description,
      images,
      links,
      socialLinks,
      textContent,
      metadata,
      videoUrls,
    };
  } catch (error) {
    console.error("Crawler error:", error);
    
    // Return minimal data on error
    return {
      url,
      title: undefined,
      description: undefined,
      images: [],
      links: [],
      socialLinks: [],
      textContent: "",
      metadata: {},
    };
  }
}

export function normalizeUrl(inputUrl: string): string {
  let url = inputUrl.trim();
  
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    throw new Error("Invalid URL format");
  }
}

export function hashUrl(url: string): string {
  // Simple hash function for URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
