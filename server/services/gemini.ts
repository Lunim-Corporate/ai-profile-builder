import { GoogleGenAI } from "@google/genai";
import {
  platformTypes,
  type SynthesisResult,
  type CrawledData,
  type Platform,
  type Project,
  type MediaItem,
} from "@shared/schema";
import { truncateForDebug } from "../pipelineDebug";

const GEMINI_MODEL = "gemini-2.5-flash";

interface EnrichmentData {
  additionalInfo: string;
  projects: Array<{
    title: string;
    year: string;
    role: string;
    platform: string;
  }>;
  collaborators: string[];
}

export type GeminiSynthesisDebug = {
  model: string;
  path:
    | "gemini"
    | "fallback_no_api_key"
    | "fallback_empty_response"
    | "fallback_json_parse"
    | "fallback_exception";
  prompt: string;
  rawResponseText: string;
  parseError?: string;
  exceptionMessage?: string;
};

function buildSynthesisPrompt(crawledData: CrawledData, enrichmentData: EnrichmentData): string {
  return `Analyze the following data about a creative professional and synthesize a unified profile.

CRAWLED DATA FROM THEIR WEBSITE:
Title: ${crawledData.title || "Unknown"}
Description: ${crawledData.description || "None"}
Text Content: ${crawledData.textContent.slice(0, 3000)}
Social Links: ${JSON.stringify(crawledData.socialLinks)}
Video URLs found on page: ${JSON.stringify(crawledData.videoUrls || [])}
Images found on page: ${JSON.stringify(crawledData.images.slice(0, 15))}

ADDITIONAL RESEARCH DATA:
${enrichmentData.additionalInfo.slice(0, 2000)}

EXTRACTED PROJECTS:
${JSON.stringify(enrichmentData.projects)}

COLLABORATORS MENTIONED:
${enrichmentData.collaborators.join(", ")}

Please synthesize this information and respond with a JSON object containing:
{
  "name": "Full name of the person",
  "role": "Their primary role/profession (e.g., Film Director, Musician, Designer)",
  "bio": "A comprehensive 2-3 sentence biography",
  "yearsActive": "Year range like '2010 - Present'",
  "confidence": 0.0 to 1.0 (how confident you are in this profile),
  "projects": [
    {
      "id": "unique-id",
      "title": "Project title",
      "year": "2023",
      "role": "Their role",
      "platform": "imdb|youtube|vimeo|tmdb|website",
      "collaborators": ["name1", "name2"],
      "hasVideo": true/false,
      "description": "Brief description",
      "videoUrl": "https://youtube.com/watch?v=... or https://vimeo.com/... (if available)",
      "sourceUrl": "https://imdb.com/title/... or link to project page (required for clickable projects)",
      "coverImage": "URL from the images list that best matches this project (if available)"
    }
  ],
  "media": [
    {
      "id": "unique-id",
      "url": "video URL if available",
      "title": "Video title",
      "description": "Description",
      "platform": "youtube|vimeo"
    }
  ],
  "platforms": ["imdb", "youtube"] // platforms where they have presence
}

If you cannot determine certain information, use reasonable defaults and lower the confidence score.
Respond ONLY with valid JSON, no markdown formatting.`;
}

export async function synthesizeProfile(
  crawledData: CrawledData,
  enrichmentData: EnrichmentData,
  options?: { captureDebug?: boolean },
): Promise<{ synthesis: SynthesisResult; debug?: GeminiSynthesisDebug }> {
  const capture = options?.captureDebug === true;
  const prompt = buildSynthesisPrompt(crawledData, enrichmentData);
  const promptForDebug = truncateForDebug(prompt, 100_000);

  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

  if (!apiKey) {
    console.warn("No Gemini API key configured, using fallback synthesis");
    return {
      synthesis: createFallbackProfile(crawledData, enrichmentData),
      ...(capture && {
        debug: {
          model: GEMINI_MODEL,
          path: "fallback_no_api_key",
          prompt: promptForDebug,
          rawResponseText: "",
        },
      }),
    };
  }

  try {
    console.log("Gemini API available, attempting synthesis...");
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: baseUrl ? { apiVersion: "", baseUrl } : undefined,
    });

    const usingReplitAI = !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    console.log(`Calling Gemini API (${usingReplitAI ? "Replit AI" : "user key"}) with model ${GEMINI_MODEL}...`);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    console.log("Gemini API responded");

    let text = "";
    if (typeof response.text === "string") {
      text = response.text;
      console.log("Extracted text from response.text property");
    } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
      text = response.candidates[0].content.parts[0].text;
      console.log("Extracted text from response.candidates structure");
    }

    if (!text) {
      console.warn("Gemini returned empty response, using fallback");
      console.log("Response structure:", JSON.stringify(response, null, 2).substring(0, 500));
      return {
        synthesis: createFallbackProfile(crawledData, enrichmentData),
        ...(capture && {
          debug: {
            model: GEMINI_MODEL,
            path: "fallback_empty_response",
            prompt: promptForDebug,
            rawResponseText: "",
          },
        }),
      };
    }

    console.log("Gemini synthesis successful, parsing JSON response...");

    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.log("Initial JSON parse failed, attempting to fix...");
      const startBrace = jsonText.indexOf("{");
      const endBrace = jsonText.lastIndexOf("}");
      if (startBrace !== -1 && endBrace > startBrace) {
        jsonText = jsonText.slice(startBrace, endBrace + 1);
        try {
          parsed = JSON.parse(jsonText);
        } catch (e2) {
          try {
            jsonText = jsonText
              .replace(/,\s*}/g, "}")
              .replace(/,\s*]/g, "]")
              .replace(/:\s*"([^"]*)"([^",}\]]*)"([^"]*)":/g, ': "$1\\"$2\\"$3":');
            parsed = JSON.parse(jsonText);
          } catch (e3) {
            const parseError =
              e3 instanceof Error ? e3.message : e instanceof Error ? e.message : String(e3);
            return {
              synthesis: createFallbackProfile(crawledData, enrichmentData),
              ...(capture && {
                debug: {
                  model: GEMINI_MODEL,
                  path: "fallback_json_parse",
                  prompt: promptForDebug,
                  rawResponseText: truncateForDebug(text, 100_000),
                  parseError,
                },
              }),
            };
          }
        }
      } else {
        const parseError = e instanceof Error ? e.message : String(e);
        return {
          synthesis: createFallbackProfile(crawledData, enrichmentData),
          ...(capture && {
            debug: {
              model: GEMINI_MODEL,
              path: "fallback_json_parse",
              prompt: promptForDebug,
              rawResponseText: truncateForDebug(text, 100_000),
              parseError,
            },
          }),
        };
      }
    }

    return {
      synthesis: normalizeProfile(parsed, crawledData),
      ...(capture && {
        debug: {
          model: GEMINI_MODEL,
          path: "gemini",
          prompt: promptForDebug,
          rawResponseText: truncateForDebug(text, 100_000),
        },
      }),
    };
  } catch (error) {
    console.error("Gemini synthesis error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    const exceptionMessage = error instanceof Error ? error.message : String(error);
    return {
      synthesis: createFallbackProfile(crawledData, enrichmentData),
      ...(capture && {
        debug: {
          model: GEMINI_MODEL,
          path: "fallback_exception",
          prompt: promptForDebug,
          rawResponseText: "",
          exceptionMessage,
        },
      }),
    };
  }
}

function normalizeProfile(parsed: any, crawledData: CrawledData): SynthesisResult {
  const validPlatforms = (platforms: any[]): Platform[] => {
    if (!Array.isArray(platforms)) return ["website"];
    return platforms.filter((p): p is Platform => platformTypes.includes(p as Platform));
  };

  const normalizedProjects: Project[] = (parsed.projects || []).map((p: any, i: number) => ({
    id: p.id || `project-${i}`,
    title: String(p.title || "Untitled Project"),
    year: String(p.year || "Unknown"),
    role: String(p.role || "Creator"),
    platform: platformTypes.includes(p.platform) ? p.platform : "website",
    collaborators: Array.isArray(p.collaborators) ? p.collaborators.map(String) : [],
    hasVideo: Boolean(p.hasVideo || p.videoUrl),
    description: p.description ? String(p.description) : undefined,
    coverImage: p.coverImage ? String(p.coverImage) : undefined,
    videoUrl: p.videoUrl ? String(p.videoUrl) : undefined,
    sourceUrl: p.sourceUrl ? String(p.sourceUrl) : undefined,
  }));

  const normalizedMedia: MediaItem[] = (parsed.media || [])
    .map((m: any, i: number) => ({
      id: m.id || `media-${i}`,
      url: String(m.url || ""),
      title: String(m.title || "Untitled"),
      description: m.description ? String(m.description) : undefined,
      platform: platformTypes.includes(m.platform) ? m.platform : "youtube",
      thumbnail: undefined,
    }))
    .filter((m: MediaItem) => m.url);

  return {
    name: String(parsed.name || crawledData.title || "Unknown"),
    role: String(parsed.role || "Creative Professional"),
    bio: String(parsed.bio || crawledData.description || "No biography available."),
    yearsActive: String(parsed.yearsActive || "Unknown"),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
    projects: normalizedProjects,
    media: normalizedMedia,
    platforms: validPlatforms(parsed.platforms),
  };
}

function createFallbackProfile(
  crawledData: CrawledData,
  enrichmentData: EnrichmentData,
): SynthesisResult {
  const name = crawledData.title?.split(/[-–|]/)[0].trim() || "Unknown";

  const projects: Project[] = enrichmentData.projects.map((p, i) => ({
    id: `project-${i}`,
    title: p.title,
    year: p.year,
    role: p.role,
    platform: (platformTypes.includes(p.platform as Platform) ? p.platform : "website") as Platform,
    collaborators: enrichmentData.collaborators.slice(0, 3),
    hasVideo: false,
  }));

  const platforms: Platform[] = crawledData.socialLinks.map((l) => l.platform);
  if (!platforms.includes("website")) {
    platforms.push("website");
  }

  return {
    name,
    role: "Creative Professional",
    bio: crawledData.description || "Profile synthesized from web presence.",
    yearsActive: "Unknown",
    confidence: 0.4,
    projects,
    media: [],
    platforms: Array.from(new Set(platforms)),
  };
}
