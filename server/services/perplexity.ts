import axios from "axios";
import type { Platform } from "@shared/schema";
import { platformTypes } from "@shared/schema";
import { truncateForDebug } from "../pipelineDebug";
import type { ResearchSubjectResolution } from "./researchSubject";

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface EnrichmentProjectRow {
  title: string;
  year: string;
  role: string;
  platform: string;
}

export interface PerplexityStructured {
  research_subject: string;
  subject_resolution_note?: string;
  summary: string;
  projects: Array<{
    title?: string;
    year?: string | number;
    role?: string;
    platform?: string;
  }>;
  collaborators: string[];
  profile_urls: Record<string, string | null>;
}

export interface EnrichmentResult {
  additionalInfo: string;
  projects: EnrichmentProjectRow[];
  collaborators: string[];
  success: boolean;
  structured: PerplexityStructured | null;
}

const SYSTEM_MESSAGE = `You are a research assistant for an automated profile builder.

Rules:
- Answer in ONE response. Do NOT ask the user questions. Do NOT ask for confirmation or clarification.
- If the site is a fan community, news blog, or forum, ASSUME the research subject is the creator / artist / public figure the site is about (infer from context). State that assumption briefly in subject_resolution_note.
- Use web search results when needed; prefer official or widely cited profiles.
- Output MUST be a single JSON object only (no prose before or after the JSON, no markdown fences).`;

function buildUserPrompt(resolution: ResearchSubjectResolution, context: string): string {
  const ctx = context.slice(0, 2800);
  return `STEP A — Subject (identity)
- site_label: how the page titles itself: "${resolution.siteLabel}"
- suggested_research_subject (from our resolver): "${resolution.researchSubject}"
- resolver_note: ${resolution.resolutionNote}

STEP B — Research (single pass)
Use suggested_research_subject unless the page is clearly about a different primary entity; if you override, explain briefly in subject_resolution_note.

Website text context:
${ctx}

Return ONLY valid JSON with exactly this shape:
{
  "research_subject": "string — confirmed entity you researched",
  "subject_resolution_note": "string — one sentence on how you chose the subject",
  "summary": "string — 2-4 sentences: who they are and notable work",
  "projects": [
    { "title": "string", "year": "YYYY", "role": "string", "platform": "imdb|youtube|vimeo|tmdb|website" }
  ],
  "collaborators": ["name strings — empty array if none"],
  "profile_urls": {
    "imdb": "https://... or null",
    "youtube": "https://... or null",
    "vimeo": "https://... or null",
    "linkedin": "https://... or null",
    "facebook": "https://... or null",
    "twitter": "https://... or null",
    "instagram": "https://... or null",
    "tmdb": "https://... or null",
    "website": "https://... or null"
  }
}

Use null for unknown URLs. Prefer canonical profile URLs.`;
}

export type PerplexityDebugInfo =
  | {
      model: "sonar";
      systemMessage: string;
      userPrompt: string;
      rawResponse: string;
    }
  | { skipped: true; reason: string }
  | { error: true; message: string; userPrompt?: string };

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return t.trim();
}

function tryParseStructuredJson(content: string): PerplexityStructured | null {
  const stripped = stripCodeFences(content);
  try {
    const parsed = JSON.parse(stripped) as unknown;
    return normalizeStructured(parsed);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
        return normalizeStructured(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeStructured(raw: unknown): PerplexityStructured | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = o.summary;
  if (typeof summary !== "string" || !summary.trim()) return null;

  const projectsIn = Array.isArray(o.projects) ? o.projects : [];
  const projects = projectsIn
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      title: typeof p.title === "string" ? p.title : "",
      year: p.year != null ? String(p.year) : "",
      role: typeof p.role === "string" ? p.role : undefined,
      platform: typeof p.platform === "string" ? p.platform : undefined,
    }))
    .filter((p) => p.title.length > 0);

  const collaborators = Array.isArray(o.collaborators)
    ? o.collaborators.filter((c): c is string => typeof c === "string")
    : [];

  const profile_urls: Record<string, string | null> = {};
  const pu = o.profile_urls;
  if (pu && typeof pu === "object" && !Array.isArray(pu)) {
    for (const [k, v] of Object.entries(pu as Record<string, unknown>)) {
      if (v === null || v === undefined) profile_urls[k] = null;
      else if (typeof v === "string") profile_urls[k] = v;
    }
  }

  const research_subject =
    typeof o.research_subject === "string" && o.research_subject.trim()
      ? o.research_subject.trim()
      : typeof o.researchSubject === "string"
        ? o.researchSubject.trim()
        : "";

  const subject_resolution_note =
    typeof o.subject_resolution_note === "string"
      ? o.subject_resolution_note
      : typeof o.subjectResolutionNote === "string"
        ? o.subjectResolutionNote
        : undefined;

  return {
    research_subject: research_subject || "Unknown",
    subject_resolution_note: subject_resolution_note,
    summary: summary.trim(),
    projects,
    collaborators,
    profile_urls,
  };
}

function normalizePlatform(p?: string): string {
  if (p && platformTypes.includes(p as Platform)) return p;
  return "website";
}

function rowsFromStructured(s: PerplexityStructured): EnrichmentProjectRow[] {
  return s.projects.slice(0, 15).map((p) => ({
    title: (p.title || "Untitled").slice(0, 200),
    year: (p.year || "Unknown").slice(0, 16),
    role: (typeof p.role === "string" ? p.role : "Creator").slice(0, 120),
    platform: normalizePlatform(typeof p.platform === "string" ? p.platform : undefined),
  }));
}

function buildAdditionalInfo(structured: PerplexityStructured | null, rawContent: string): string {
  if (structured) {
    const header = [
      structured.subject_resolution_note,
      `Research subject (confirmed): ${structured.research_subject}`,
      structured.summary,
      structured.collaborators.length
        ? `Collaborators: ${structured.collaborators.join(", ")}`
        : "",
      Object.keys(structured.profile_urls).length
        ? `profile_urls: ${JSON.stringify(structured.profile_urls)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return header.slice(0, 12000);
  }
  return rawContent;
}

export async function searchWithPerplexity(
  resolution: ResearchSubjectResolution,
  context: string,
  options?: { captureDebug?: boolean },
): Promise<{ enrichment: EnrichmentResult; debug?: PerplexityDebugInfo }> {
  const capture = options?.captureDebug === true;
  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.warn("PERPLEXITY_API_KEY not configured, skipping enrichment");
    return {
      enrichment: {
        additionalInfo: "",
        projects: [],
        collaborators: [],
        success: false,
        structured: null,
      },
      ...(capture && {
        debug: { skipped: true, reason: "PERPLEXITY_API_KEY not set" },
      }),
    };
  }

  const userPrompt = buildUserPrompt(resolution, context);

  try {
    const response = await axios.post<PerplexityResponse>(
      "https://api.perplexity.ai/chat/completions",
      {
        model: "sonar",
        messages: [
          {
            role: "system",
            content: SYSTEM_MESSAGE,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.15,
        max_tokens: 3500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const content = response.data.choices[0]?.message?.content || "";
    const structured = tryParseStructuredJson(content);

    const projects = structured
      ? rowsFromStructured(structured)
      : extractProjectsLegacy(content);
    const collaborators = structured
      ? structured.collaborators.slice(0, 20)
      : extractCollaboratorsLegacy(content);

    const additionalInfo = buildAdditionalInfo(structured, content);

    return {
      enrichment: {
        additionalInfo,
        projects,
        collaborators,
        success: true,
        structured,
      },
      ...(capture && {
        debug: {
          model: "sonar",
          systemMessage: SYSTEM_MESSAGE,
          userPrompt,
          rawResponse: truncateForDebug(content, 50_000),
        },
      }),
    };
  } catch (error) {
    console.error("Perplexity API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      enrichment: {
        additionalInfo: "",
        projects: [],
        collaborators: [],
        success: false,
        structured: null,
      },
      ...(capture && {
        debug: { error: true, message, userPrompt },
      }),
    };
  }
}

function extractProjectsLegacy(content: string): EnrichmentProjectRow[] {
  const projects: EnrichmentProjectRow[] = [];

  const yearPattern = /\b(19|20)\d{2}\b/g;
  const lines = content.split("\n");

  for (const line of lines) {
    const yearMatch = line.match(yearPattern);
    if (yearMatch && line.length > 10 && line.length < 200) {
      const cleanedTitle = line
        .replace(yearPattern, "")
        .replace(/[-–—:]/g, "")
        .replace(/\(.*?\)/g, "")
        .trim()
        .slice(0, 100);

      if (cleanedTitle.length > 3) {
        projects.push({
          title: cleanedTitle,
          year: yearMatch[0],
          role: "Creator",
          platform: "website",
        });
      }
    }
  }

  return projects.slice(0, 10);
}

function extractCollaboratorsLegacy(content: string): string[] {
  const collaborators: string[] = [];

  const patterns = [
    /(?:worked with|collaborated with|featuring|starring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /(?:with|and)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (name.length > 3 && name.length < 50 && !collaborators.includes(name)) {
        collaborators.push(name);
      }
    }
  }

  return collaborators.slice(0, 10);
}
