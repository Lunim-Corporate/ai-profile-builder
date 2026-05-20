import axios from "axios";
import type { CrawledData, SocialLink } from "@shared/schema";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  media_type?: string;
  overview?: string;
}

interface TMDBPersonResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  popularity: number;
}

interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPersonResult[];
  total_results: number;
  total_pages: number;
}

interface TMDBSearchResponse {
  page: number;
  results: TMDBSearchResult[];
  total_results: number;
  total_pages: number;
}

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  imdb_id?: string;
  overview?: string;
}

interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview?: string;
}

function extractYear(yearStr: string): string | undefined {
  const match = yearStr.match(/(\d{4})/);
  return match ? match[1] : undefined;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesMatch(projectTitle: string, tmdbTitle: string): boolean {
  const normalizedProject = normalizeTitle(projectTitle);
  const normalizedTmdb = normalizeTitle(tmdbTitle);
  
  if (normalizedProject === normalizedTmdb) {
    return true;
  }
  
  if (normalizedProject.includes(normalizedTmdb) || normalizedTmdb.includes(normalizedProject)) {
    return true;
  }
  
  const projectWords = new Set(normalizedProject.split(" ").filter(w => w.length > 2));
  const tmdbWords = new Set(normalizedTmdb.split(" ").filter(w => w.length > 2));
  
  if (projectWords.size === 0 || tmdbWords.size === 0) {
    return normalizedProject === normalizedTmdb;
  }
  
  let matchingWords = 0;
  Array.from(projectWords).forEach(word => {
    if (tmdbWords.has(word)) {
      matchingWords++;
    }
  });
  
  const overlapRatio = matchingWords / Math.min(projectWords.size, tmdbWords.size);
  return overlapRatio >= 0.6;
}

export function buildPosterUrl(posterPath: string, size: string = "w500"): string {
  return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
}

export async function searchMulti(query: string, year?: string): Promise<TMDBSearchResult | null> {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping TMDB lookup");
    return null;
  }

  try {
    const params: Record<string, string> = {
      api_key: apiKey,
      query: query,
      include_adult: "false",
    };
    
    if (year) {
      params.year = year;
    }

    const response = await axios.get<TMDBSearchResponse>(`${TMDB_BASE_URL}/search/multi`, {
      params,
      timeout: 5000,
    });

    if (response.data.results && response.data.results.length > 0) {
      const movieOrTv = response.data.results.find(
        r => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path
      );
      
      if (movieOrTv) {
        return movieOrTv;
      }
    }

    return null;
  } catch (error) {
    console.error("TMDB multi search error:", error);
    return null;
  }
}

export async function searchMovie(title: string, year?: string): Promise<TMDBSearchResult | null> {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping movie lookup");
    return null;
  }

  try {
    const params: Record<string, string> = {
      api_key: apiKey,
      query: title,
      include_adult: "false",
    };
    
    if (year) {
      params.year = year;
    }

    const response = await axios.get<TMDBSearchResponse>(`${TMDB_BASE_URL}/search/movie`, {
      params,
      timeout: 5000,
    });

    if (response.data.results && response.data.results.length > 0) {
      const withPoster = response.data.results.find(r => r.poster_path);
      if (withPoster) {
        return withPoster;
      }
    }

    return null;
  } catch (error) {
    console.error("TMDB movie search error:", error);
    return null;
  }
}

export async function searchTV(title: string, year?: string): Promise<TMDBSearchResult | null> {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping TV lookup");
    return null;
  }

  try {
    const params: Record<string, string> = {
      api_key: apiKey,
      query: title,
      include_adult: "false",
    };
    
    if (year) {
      params.first_air_date_year = year;
    }

    const response = await axios.get<TMDBSearchResponse>(`${TMDB_BASE_URL}/search/tv`, {
      params,
      timeout: 5000,
    });

    if (response.data.results && response.data.results.length > 0) {
      const withPoster = response.data.results.find(r => r.poster_path);
      if (withPoster) {
        return withPoster;
      }
    }

    return null;
  } catch (error) {
    console.error("TMDB TV search error:", error);
    return null;
  }
}

export async function getMovieDetails(movieId: number): Promise<TMDBMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    return null;
  }

  try {
    const response = await axios.get<TMDBMovie>(`${TMDB_BASE_URL}/movie/${movieId}`, {
      params: { api_key: apiKey },
      timeout: 5000,
    });

    return response.data;
  } catch (error) {
    console.error("TMDB movie details error:", error);
    return null;
  }
}

export async function enrichProjectsWithPosters<T extends { title: string; year: string; coverImage?: string; sourceUrl?: string }>(
  projects: T[]
): Promise<T[]> {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping poster enrichment");
    return projects;
  }

  console.log("Enriching projects with TMDB posters...");
  
  const enrichedProjects = await Promise.all(
    projects.map(async (project) => {
      let cleanTitle = project.title
        .replace(/\|/g, "")
        .replace(/\*/g, "")
        .replace(/\(film\)/gi, "")
        .replace(/\(documentary\)/gi, "")
        .replace(/\(short\)/gi, "")
        .replace(/\(movie\)/gi, "")
        .replace(/\(tv\s*series?\)/gi, "")
        .replace(/[^a-zA-Z0-9\s'-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      
      if (cleanTitle.length < 2) {
        return project;
      }

      const year = extractYear(project.year);

      try {
        // First try movie search
        let result = await searchMovie(cleanTitle, year);
        let mediaType = "movie";
        
        // If no movie found, try TV search
        if (!result) {
          result = await searchTV(cleanTitle, year);
          mediaType = "tv";
        }
        
        // If still nothing, try multi-search
        if (!result) {
          result = await searchMulti(cleanTitle, year);
          mediaType = result?.media_type || "movie";
        }
        
        if (result && result.poster_path) {
          const tmdbTitle = result.title || result.name || "";
          
          if (!titlesMatch(cleanTitle, tmdbTitle)) {
            console.log(`Title mismatch - Requested: "${cleanTitle}", Got: "${tmdbTitle}" - skipping`);
            return project;
          }
          
          const tmdbDateStr = result.release_date || result.first_air_date || "";
          const tmdbYear = extractYear(tmdbDateStr);
          
          if (year && tmdbYear) {
            if (Math.abs(parseInt(tmdbYear) - parseInt(year)) > 2) {
              console.log(`Year mismatch - Requested: ${year}, Got: ${tmdbYear} - skipping`);
              return project;
            }
          }
          
          console.log(`TMDB Matched: "${cleanTitle}" (${year}) -> "${tmdbTitle}" (${tmdbYear}) [${mediaType}:${result.id}]`);
          
          const posterUrl = buildPosterUrl(result.poster_path);
          const updates: Partial<T> = { coverImage: posterUrl } as Partial<T>;
          
          // Add TMDB sourceUrl if project doesn't have one
          if (!project.sourceUrl) {
            if (mediaType === "tv") {
              (updates as any).sourceUrl = `https://www.themoviedb.org/tv/${result.id}`;
            } else {
              (updates as any).sourceUrl = `https://www.themoviedb.org/movie/${result.id}`;
            }
          }
          
          return { ...project, ...updates };
        }
      } catch (error) {
        console.error(`Failed to get TMDB poster for ${cleanTitle}:`, error);
      }
      
      return project;
    })
  );

  return enrichedProjects;
}

async function searchPersonBestMatch(name: string): Promise<TMDBPersonResult | null> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await axios.get<TMDBPersonSearchResponse>(`${TMDB_BASE_URL}/search/person`, {
      params: {
        api_key: apiKey,
        query: name,
        include_adult: "false",
      },
      timeout: 5000,
    });

    if (!response.data.results?.length) {
      return null;
    }

    const withPhoto = response.data.results
      .filter((r) => r.profile_path)
      .sort((a, b) => b.popularity - a.popularity);

    return withPhoto.length > 0 ? withPhoto[0] : null;
  } catch (error) {
    console.error("TMDB person search error:", error);
    return null;
  }
}

/**
 * Same person match as the headshot flow, plus canonical TMDB + IMDb profile URLs from TMDB API
 * (does not depend on Perplexity or crawl listing those links).
 */
export async function lookupTmdbPerson(name: string): Promise<{
  imageUrl: string | null;
  socialLinks: SocialLink[];
} | null> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping person lookup");
    return null;
  }

  const match = await searchPersonBestMatch(name);
  if (!match) {
    return null;
  }

  console.log(`TMDB Person found: "${name}" -> "${match.name}" (popularity: ${match.popularity})`);

  const imageUrl = match.profile_path ? `${TMDB_IMAGE_BASE}/w500${match.profile_path}` : null;

  const socialLinks: SocialLink[] = [
    { platform: "tmdb", url: `https://www.themoviedb.org/person/${match.id}` },
  ];

  try {
    const ext = await axios.get<{ imdb_id?: string | null }>(
      `${TMDB_BASE_URL}/person/${match.id}/external_ids`,
      {
        params: { api_key: apiKey },
        timeout: 5000,
      },
    );
    const imdbId = ext.data?.imdb_id;
    if (typeof imdbId === "string" && /^nm\d+$/i.test(imdbId.trim())) {
      const id = imdbId.trim();
      socialLinks.push({ platform: "imdb", url: `https://www.imdb.com/name/${id}/` });
    }
  } catch (error) {
    console.warn("TMDB person external_ids error:", error);
  }

  return { imageUrl, socialLinks };
}

export async function searchPerson(name: string): Promise<string | null> {
  const resolved = await lookupTmdbPerson(name);
  return resolved?.imageUrl ?? null;
}

interface TMDBPersonDetail {
  id: number;
  name: string;
  biography?: string;
  profile_path: string | null;
  known_for_department?: string;
  place_of_birth?: string;
  birthday?: string;
}

interface TMDBCreditItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  character?: string;
  job?: string;
  media_type: string;
}

interface TMDBCombinedCredits {
  cast: TMDBCreditItem[];
}

function tmdbApiKey(): string | null {
  const apiKey = process.env.TMDB_API_KEY;
  return apiKey?.trim() ? apiKey : null;
}

/** Resolve TMDB person id from an IMDb name id (e.g. nm0000123). */
export async function findTmdbPersonIdByImdbId(imdbId: string): Promise<number | null> {
  const apiKey = tmdbApiKey();
  if (!apiKey) return null;

  const normalized = imdbId.replace(/^nm/i, "nm");
  const id = normalized.startsWith("nm") ? normalized : `nm${normalized}`;

  try {
    const response = await axios.get<{
      person_results?: { id: number }[];
    }>(`${TMDB_BASE_URL}/find/${id}`, {
      params: { api_key: apiKey, external_source: "imdb_id" },
      timeout: 8000,
    });

    const match = response.data.person_results?.[0];
    return match?.id ?? null;
  } catch (error) {
    console.error("TMDB find by IMDb id error:", error);
    return null;
  }
}

function formatCreditLine(credit: TMDBCreditItem): string {
  const title = credit.title || credit.name || "Unknown";
  const year = (credit.release_date || credit.first_air_date || "").slice(0, 4);
  const role = credit.character || credit.job || "";
  const type = credit.media_type === "tv" ? "TV" : "Film";
  const yearPart = year ? ` (${year})` : "";
  const rolePart = role ? ` — ${role}` : "";
  return `${title}${yearPart} [${type}]${rolePart}`;
}

/**
 * Build CrawledData from TMDB person APIs (used for IMDb/TMDB profile URLs).
 */
export async function buildCrawledDataFromTmdbPersonId(
  personId: number,
  sourceUrl: string,
  options?: { imdbProfileUrl?: string },
): Promise<CrawledData | null> {
  const apiKey = tmdbApiKey();
  if (!apiKey) {
    console.warn("TMDB_API_KEY not configured, skipping platform API crawl");
    return null;
  }

  try {
    const [detailRes, creditsRes, externalRes] = await Promise.all([
      axios.get<TMDBPersonDetail>(`${TMDB_BASE_URL}/person/${personId}`, {
        params: { api_key: apiKey },
        timeout: 8000,
      }),
      axios.get<TMDBCombinedCredits>(`${TMDB_BASE_URL}/person/${personId}/combined_credits`, {
        params: { api_key: apiKey },
        timeout: 8000,
      }),
      axios
        .get<{ imdb_id?: string | null }>(`${TMDB_BASE_URL}/person/${personId}/external_ids`, {
          params: { api_key: apiKey },
          timeout: 5000,
        })
        .catch(() => ({ data: {} as { imdb_id?: string | null } })),
    ]);

    const person = detailRes.data;
    const cast = creditsRes.data.cast ?? [];
    const sortedCredits = [...cast].sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || "";
      const dateB = b.release_date || b.first_air_date || "";
      return dateB.localeCompare(dateA);
    });

    const filmographyLines = sortedCredits.slice(0, 40).map(formatCreditLine);
    const bio = (person.biography || "").trim();
    const department = person.known_for_department?.trim();
    const textParts = [
      bio,
      department ? `Known for: ${department}` : "",
      filmographyLines.length > 0
        ? `Selected credits:\n${filmographyLines.join("\n")}`
        : "",
    ].filter(Boolean);

    const socialLinks: SocialLink[] = [
      { platform: "tmdb", url: `https://www.themoviedb.org/person/${personId}` },
    ];

    const imdbFromApi = externalRes.data?.imdb_id;
    if (typeof imdbFromApi === "string" && /^nm\d+$/i.test(imdbFromApi.trim())) {
      socialLinks.push({
        platform: "imdb",
        url: `https://www.imdb.com/name/${imdbFromApi.trim()}/`,
      });
    } else if (options?.imdbProfileUrl) {
      socialLinks.push({ platform: "imdb", url: options.imdbProfileUrl });
    }

    const images: string[] = [];
    if (person.profile_path) {
      images.push(buildPosterUrl(person.profile_path, "w500"));
    }

    const links = [
      `https://www.themoviedb.org/person/${personId}`,
      ...sortedCredits.slice(0, 20).map((c) => {
        if (c.media_type === "tv") {
          return `https://www.themoviedb.org/tv/${c.id}`;
        }
        return `https://www.themoviedb.org/movie/${c.id}`;
      }),
    ];

    return {
      url: sourceUrl,
      title: person.name,
      description: bio.slice(0, 500) || department,
      images,
      links: Array.from(new Set(links)),
      socialLinks,
      textContent: textParts.join("\n\n").slice(0, 10000),
      metadata: {
        _crawlSource: "tmdb_api",
        tmdb_person_id: String(personId),
      },
      videoUrls: [],
    };
  } catch (error) {
    console.error("TMDB person crawl error:", error);
    return null;
  }
}
