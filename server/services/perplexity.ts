import axios from "axios";
import { truncateForDebug } from "../pipelineDebug";

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface EnrichmentResult {
  additionalInfo: string;
  projects: Array<{
    title: string;
    year: string;
    role: string;
    platform: string;
  }>;
  collaborators: string[];
  success: boolean;
}

const SYSTEM_MESSAGE =
  "You are a research assistant that finds accurate information about creative professionals. Provide factual, verified information only.";

export type PerplexityDebugInfo =
  | {
      model: "sonar";
      systemMessage: string;
      userPrompt: string;
      rawResponse: string;
    }
  | { skipped: true; reason: string }
  | { error: true; message: string; userPrompt?: string };

function buildUserPrompt(name: string, context: string): string {
  return `Find information about the creative professional "${name}". 
Context from their website: ${context.slice(0, 1000)}

Please provide:
1. A brief summary of who they are and their notable work
2. A list of their major projects (films, videos, albums, etc.) with years
3. Key collaborators they've worked with
4. Any relevant IMDb, YouTube, Vimeo, or other platform profiles

Format the response as structured information.`;
}

export async function searchWithPerplexity(
  name: string,
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
      },
      ...(capture && {
        debug: { skipped: true, reason: "PERPLEXITY_API_KEY not set" },
      }),
    };
  }

  const userPrompt = buildUserPrompt(name, context);

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
        temperature: 0.2,
        max_tokens: 2000,
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

    const projects = extractProjects(content);
    const collaborators = extractCollaborators(content);

    return {
      enrichment: {
        additionalInfo: content,
        projects,
        collaborators,
        success: true,
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
      },
      ...(capture && {
        debug: { error: true, message, userPrompt },
      }),
    };
  }
}

function extractProjects(content: string): Array<{
  title: string;
  year: string;
  role: string;
  platform: string;
}> {
  const projects: Array<{
    title: string;
    year: string;
    role: string;
    platform: string;
  }> = [];

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

function extractCollaborators(content: string): string[] {
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
