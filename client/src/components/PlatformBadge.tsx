import { Badge } from "@/components/ui/badge";
import { 
  Film, 
  Youtube, 
  Video, 
  Linkedin, 
  Facebook,
  Database,
  Globe,
  Hash,
  Camera,
} from "lucide-react";

export type Platform =
  | "imdb"
  | "tmdb"
  | "omdb"
  | "youtube"
  | "vimeo"
  | "linkedin"
  | "facebook"
  | "twitter"
  | "instagram"
  | "website";

interface PlatformBadgeProps {
  platform: Platform;
  className?: string;
}

const platformConfig: Record<Platform, { label: string; icon: typeof Film; bgClass: string }> = {
  imdb: { label: "IMDb", icon: Film, bgClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  tmdb: { label: "TMDB", icon: Database, bgClass: "bg-green-500/10 text-green-600 dark:text-green-400" },
  omdb: { label: "OMDB", icon: Database, bgClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  youtube: { label: "YouTube", icon: Youtube, bgClass: "bg-red-500/10 text-red-600 dark:text-red-400" },
  vimeo: { label: "Vimeo", icon: Video, bgClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  linkedin: { label: "LinkedIn", icon: Linkedin, bgClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  facebook: { label: "Facebook", icon: Facebook, bgClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  twitter: { label: "X / Twitter", icon: Hash, bgClass: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300" },
  instagram: { label: "Instagram", icon: Camera, bgClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  website: { label: "Website", icon: Globe, bgClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
};

export default function PlatformBadge({ platform, className = "" }: PlatformBadgeProps) {
  const config = platformConfig[platform] || platformConfig.website;
  const Icon = config.icon;

  return (
    <Badge 
      variant="secondary" 
      className={`${config.bgClass} border-0 text-xs uppercase tracking-wide font-semibold gap-1 ${className}`}
      data-testid={`badge-platform-${platform}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
