import { ExternalLink } from "lucide-react";
import type { Platform } from "./PlatformBadge";

interface SourceTagProps {
  platform: Platform;
  className?: string;
}

const platformNames: Record<Platform, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  omdb: "OMDB",
  youtube: "YouTube",
  vimeo: "Vimeo",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  twitter: "X / Twitter",
  instagram: "Instagram",
  website: "Website",
};

export default function SourceTag({ platform, className = "" }: SourceTagProps) {
  return (
    <span 
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground opacity-70 ${className}`}
      data-testid={`tag-source-${platform}`}
    >
      <ExternalLink className="w-3 h-3" />
      Sourced from {platformNames[platform]}
    </span>
  );
}
