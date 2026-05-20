import type { CrawledData } from "@shared/schema";

export type ResearchSubjectResolution = {
  /** First segment of page title (site / brand label). */
  siteLabel: string;
  /** Entity to research (person, studio, etc.). */
  researchSubject: string;
  /** Why we chose this subject (for logs / optional downstream use). */
  resolutionNote: string;
};

/**
 * Derive who Perplexity should research from crawl metadata + text,
 * without relying only on the raw page title (avoids "Fan site" dead-ends).
 */
export function resolveResearchSubject(crawled: CrawledData): ResearchSubjectResolution {
  const title = crawled.title?.trim() || "";
  const siteLabel = title.split(/[-–|]/)[0].trim() || "Unknown";

  let researchSubject = siteLabel;
  let resolutionNote = "Research subject defaults to the first segment of the page title.";

  const possessive = siteLabel.match(/^(.+?)['']s\s+fans?\b/i);
  if (possessive?.[1]) {
    researchSubject = possessive[1].trim();
    resolutionNote =
      "Resolved from possessive title (e.g. “Name’s Fans”) — researching the named creator, not the fan brand.";
    return { siteLabel, researchSubject, resolutionNote };
  }

  const trailingFans = siteLabel.match(/^(.+?)\s+fans?\s*$/i);
  if (trailingFans?.[1]) {
    researchSubject = trailingFans[1].trim();
    resolutionNote =
      "Site label ends with “Fans” — researching the named subject (e.g. filmmaker), not the community label.";
    return { siteLabel, researchSubject, resolutionNote };
  }

  const fanCommunity = siteLabel.match(
    /^(.+?)\s+(fan\s+(community|site|forum|page)|community)\s*$/i,
  );
  if (fanCommunity?.[1]) {
    researchSubject = fanCommunity[1].trim();
    resolutionNote =
      "Site label reads as a fan/community page — researching the named subject from that label.";
    return { siteLabel, researchSubject, resolutionNote };
  }

  const desc = (crawled.description || "").trim();
  const descFilmaker =
    desc.match(
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b(?=[^.]{0,80}\b(filmmaker|director|writer|producer|artist)\b)/i,
    ) ||
    desc.match(
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(is|was)\s+(an|a)\s+[^.]+\b(filmmaker|director|writer|producer)\b/i,
    );
  if (descFilmaker?.[1] && siteLabel.toLowerCase().includes("fan")) {
    researchSubject = descFilmaker[1].trim();
    resolutionNote =
      "Title suggests a fan property; using the person named in the meta description as the research subject.";
    return { siteLabel, researchSubject, resolutionNote };
  }

  const textSample = crawled.textContent.replace(/\s+/g, " ").trim().slice(0, 1200);
  const quotedName = textSample.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:Fans|fan community)\b/,
  );
  if (quotedName?.[1] && siteLabel.toLowerCase().includes("fan")) {
    researchSubject = quotedName[1].trim();
    resolutionNote =
      "Fan-oriented copy detected in page text — using the prominent personal name as research subject.";
    return { siteLabel, researchSubject, resolutionNote };
  }

  return { siteLabel, researchSubject, resolutionNote };
}
