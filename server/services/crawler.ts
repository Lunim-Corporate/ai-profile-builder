import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer, { type Browser } from "puppeteer";
import type { CrawledData, SocialLink, Platform } from "@shared/schema";
import {
  classifyCrawlUrl,
  crawlViaPlatformApi,
  isApiBackedCrawlTarget,
} from "./platformCrawl";

const PLATFORM_PATTERNS: Record<Platform, RegExp> = {
  imdb: /imdb\.com/i,
  tmdb: /themoviedb\.org/i,
  omdb: /omdbapi\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
  vimeo: /vimeo\.com/i,
  linkedin: /linkedin\.com/i,
  facebook: /facebook\.com/i,
  twitter: /twitter\.com|(^|\/\/)(www\.)?x\.com(\/|$)/i,
  instagram: /instagram\.com/i,
  website: /.*/,
};

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BOT_WALL_SNIFF = /cloudflare|__cf_chl|challenges\.cloudflare|cf-browser-verification|Just a moment/i;

/** Classify a URL into a known social / platform bucket (same rules as anchor extraction). */
export function detectPlatform(url: string): Platform {
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

  for (const link of links) {
    for (const pattern of videoPatterns) {
      if (pattern.test(link)) {
        videoUrls.push(link);
        break;
      }
    }
  }

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

  $("[data-video-url], [data-vimeo-url], [data-youtube-url]").each((_, el) => {
    const videoUrl =
      $(el).attr("data-video-url") ||
      $(el).attr("data-vimeo-url") ||
      $(el).attr("data-youtube-url");
    if (videoUrl) {
      videoUrls.push(videoUrl);
    }
  });

  return Array.from(new Set(videoUrls));
}

function extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
  const metadata: Record<string, string> = {};

  $("meta[property^='og:']").each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) {
      metadata[property] = content;
    }
  });

  $("meta[name^='twitter:']").each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) {
      metadata[name] = content;
    }
  });

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
    .slice(0, 10000);
}

export function isCloudflareChallenge(html: string): boolean {
  if (!html || html.length < 80) return true;
  const sample = html.slice(0, 12000);
  return BOT_WALL_SNIFF.test(sample);
}

function crawlFailureMetadataFromAxiosError(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error) || !error.response) return {};
  const status = error.response.status;
  const raw = error.response.data;
  const sample = typeof raw === "string" ? raw.slice(0, 24000) : "";
  if (sample && BOT_WALL_SNIFF.test(sample)) {
    return { _crawlFailure: "cloudflare_bot_wall" };
  }
  if (status === 403 || status === 401) {
    return { _crawlFailure: `http_${status}` };
  }
  if (status >= 500) {
    return { _crawlFailure: "http_5xx" };
  }
  return { _crawlFailure: "http_or_network" };
}

function emptyCrawlResult(url: string, metadata: Record<string, string> = {}): CrawledData {
  return {
    url,
    title: undefined,
    description: undefined,
    images: [],
    links: [],
    socialLinks: [],
    textContent: "",
    metadata,
  };
}

function parseHtmlToCrawledData(url: string, html: string, crawlSource: string): CrawledData {
  const $ = cheerio.load(html);

  const title =
    $("title").text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    undefined;

  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    undefined;

  const images = extractImages($, url);
  const links = extractLinks($, url);
  const socialLinks = extractSocialLinks(links);
  const metadata = { ...extractMetadata($), _crawlSource: crawlSource };
  const videoUrls = extractVideoUrls($, links);

  $("script, style, noscript, iframe").remove();
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
}

async function fetchHtmlWithAxios(url: string): Promise<
  | { ok: true; html: string; status: number }
  | { ok: false; reason: "error"; error: unknown }
  | { ok: false; reason: "challenge"; html: string }
> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const html = typeof response.data === "string" ? response.data : String(response.data);

    if (isCloudflareChallenge(html)) {
      return { ok: false, reason: "challenge", html };
    }

    return { ok: true, html, status: response.status };
  } catch (error) {
    return { ok: false, reason: "error", error };
  }
}

function getChromiumPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const bundledPath = puppeteer.executablePath();
    if (bundledPath) return bundledPath;
  } catch {
    // Bundled Chromium not available
  }
  const nixPath =
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
  try {
    const fs = require("fs") as typeof import("fs");
    if (fs.existsSync(nixPath)) return nixPath;
  } catch {
    // Path doesn't exist
  }
  return undefined;
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = getChromiumPath();
  return puppeteer.launch({
    headless: true,
    ...(executablePath && { executablePath }),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
    ],
  });
}

async function waitPastChallenge(page: import("puppeteer").Page, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const blocked = await page.evaluate(() => {
      const title = document.title || "";
      const body = document.body?.innerText?.slice(0, 500) || "";
      return /just a moment|checking your browser|verify you are human/i.test(
        `${title} ${body}`,
      );
    });
    if (!blocked) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Fetch rendered HTML with Puppeteer (generic sites / axios fallback). */
async function fetchHtmlWithPuppeteer(url: string): Promise<string | null> {
  let browser: Browser | null = null;
  try {
    console.log("Launching Puppeteer for HTML crawl:", url);
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(BROWSER_USER_AGENT);

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await waitPastChallenge(page, 15000);
    await new Promise((r) => setTimeout(r, 1500));

    const html = await page.content();
    if (isCloudflareChallenge(html)) {
      console.log("Puppeteer still on bot challenge page:", url);
      return null;
    }

    return html;
  } catch (error) {
    console.error("Puppeteer HTML crawl error:", error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function crawlGenericWebsite(url: string): Promise<CrawledData> {
  const axiosResult = await fetchHtmlWithAxios(url);

  if (axiosResult.ok) {
    console.log("Crawl via axios succeeded:", url);
    return parseHtmlToCrawledData(url, axiosResult.html, "axios");
  }

  if (axiosResult.reason === "challenge") {
    console.log("Axios returned bot challenge HTML, trying Puppeteer:", url);
  } else if (axiosResult.reason === "error") {
    const status = axios.isAxiosError(axiosResult.error)
      ? axiosResult.error.response?.status
      : undefined;
    console.log(
      status ? `Axios crawl failed (${status}), trying Puppeteer:` : "Axios crawl failed, trying Puppeteer:",
      url,
    );
  }

  const puppeteerHtml = await fetchHtmlWithPuppeteer(url);
  if (puppeteerHtml) {
    console.log("Crawl via Puppeteer succeeded:", url);
    return parseHtmlToCrawledData(url, puppeteerHtml, "puppeteer");
  }

  if (axiosResult.reason === "error") {
    return {
      ...emptyCrawlResult(url, crawlFailureMetadataFromAxiosError(axiosResult.error)),
      videoUrls: [],
    };
  }

  if (axiosResult.reason === "challenge") {
    return {
      ...emptyCrawlResult(url, { _crawlFailure: "cloudflare_bot_wall" }),
      videoUrls: [],
    };
  }

  return {
    ...emptyCrawlResult(url, { _crawlFailure: "cloudflare_bot_wall" }),
    videoUrls: [],
  };
}

/**
 * True when the crawler extracted enough real page content to justify building a profile.
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
  const target = classifyCrawlUrl(url);

  if (isApiBackedCrawlTarget(target)) {
    console.log(`Platform API crawl (${target.kind}):`, url);
    const apiData = await crawlViaPlatformApi(url, target);
    if (apiData && crawlHasUsableContent(apiData)) {
      return apiData;
    }
    console.log(
      "Platform API crawl returned no usable content; falling back to HTTP/Puppeteer:",
      url,
    );
  }

  return crawlGenericWebsite(url);
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
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
