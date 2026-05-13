export type ApiCapabilityKey =
  | "perplexity"
  | "gemini"
  | "tmdb"
  | "youtube"
  | "vimeo"
  | "omdb";

export type ApiCapabilities = Record<ApiCapabilityKey, boolean>;

const REQUIRED_FOR_GENERATION: { keys: string[] }[] = [
  { keys: ["PERPLEXITY_API_KEY"] },
  { keys: ["GEMINI_API_KEY", "AI_INTEGRATIONS_GEMINI_API_KEY"] },
  { keys: ["TMDB_API_KEY"] },
  { keys: ["YOUTUBE_API_KEY"] },
  { keys: ["VIMEO_API_KEY"] },
];

function envSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * When true, POST /api/profiles/generate may include a large `pipelineDebug` object
 * (prompts, raw model text, crawl snapshot). Do not enable on public production servers.
 */
export function isProfilePipelineDebugEnabled(): boolean {
  const raw = process.env.PROFILE_PIPELINE_DEBUG;
  if (!raw || !raw.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getApiCapabilities(): ApiCapabilities {
  return {
    perplexity: envSet("PERPLEXITY_API_KEY"),
    gemini: envSet("AI_INTEGRATIONS_GEMINI_API_KEY") || envSet("GEMINI_API_KEY"),
    tmdb: envSet("TMDB_API_KEY"),
    youtube: envSet("YOUTUBE_API_KEY"),
    vimeo: envSet("VIMEO_API_KEY"),
    omdb: envSet("OMDB_API_KEY"),
  };
}

/** One entry per requirement; value is a human-readable "set one of" label. */
export function getMissingRequiredEnvVars(): string[] {
  const missing: string[] = [];
  for (const { keys } of REQUIRED_FOR_GENERATION) {
    const ok = keys.some(envSet);
    if (!ok) {
      missing.push(keys.join(" or "));
    }
  }
  return missing;
}

export function validateEnvForStartup(): void {
  const caps = getApiCapabilities();
  console.log(
    `[env] capabilities: perplexity=${caps.perplexity} gemini=${caps.gemini} tmdb=${caps.tmdb} youtube=${caps.youtube} vimeo=${caps.vimeo} omdb=${caps.omdb}`,
  );

  if (isProfilePipelineDebugEnabled()) {
    console.warn(
      "[env] PROFILE_PIPELINE_DEBUG is enabled — profile generation will log full pipeline traces to stdout (prompts, crawl text). Do not use on public production.",
    );
  }

  const missing = getMissingRequiredEnvVars();
  if (missing.length === 0) return;

  const msg = `[env] Missing required variables for profile generation: ${missing.join("; ")}`;

  if (process.env.NODE_ENV === "production") {
    console.error(msg);
    process.exit(1);
  }

  console.warn(msg);
}
