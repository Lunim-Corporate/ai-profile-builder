import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Platform types for data sources
export const platformTypes = [
  "imdb",
  "tmdb",
  "omdb",
  "youtube",
  "vimeo",
  "linkedin",
  "facebook",
  "twitter",
  "instagram",
  "website",
] as const;
export type Platform = typeof platformTypes[number];

// Users table (kept for auth if needed)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Social link type
export const socialLinkSchema = z.object({
  platform: z.enum(platformTypes),
  url: z.string().url(),
});
export type SocialLink = z.infer<typeof socialLinkSchema>;

// Project type classification
export const projectTypeValues = ["short_film", "feature_film", "tv_show", "music_video", "commercial", "documentary", "animation", "other"] as const;
export type ProjectType = typeof projectTypeValues[number];

// Project type for in-memory storage
export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  year: z.string(),
  role: z.string(),
  coverImage: z.string().optional(),
  coverImageLocked: z.boolean().optional(),
  platform: z.enum(platformTypes),
  collaborators: z.array(z.string()).optional(),
  hasVideo: z.boolean().optional(),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  videoType: z.enum(["full", "trailer", "clip"]).optional(),
  projectType: z.enum(projectTypeValues).optional(),
  runtime: z.number().optional(),
});
export type Project = z.infer<typeof projectSchema>;

export const apiCapabilitiesSchema = z.object({
  perplexity: z.boolean(),
  gemini: z.boolean(),
  tmdb: z.boolean(),
  youtube: z.boolean(),
  vimeo: z.boolean(),
  omdb: z.boolean(),
});
export type ApiCapabilities = z.infer<typeof apiCapabilitiesSchema>;

// Media item type
export const mediaItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().optional(),
  platform: z.enum(platformTypes),
  thumbnail: z.string().optional(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

// Profile type for in-memory storage
export const profileSchema = z.object({
  id: z.string(),
  urlHash: z.string(),
  sourceUrl: z.string(),
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  imageUrl: z.string().optional(),
  projectCount: z.number(),
  yearsActive: z.string(),
  platforms: z.array(z.enum(platformTypes)),
  socialLinks: z.array(socialLinkSchema),
  confidence: z.number().min(0).max(1),
  projects: z.array(projectSchema),
  media: z.array(mediaItemSchema),
  crawledData: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  /** Present on generate responses: which integrations had credentials at request time. */
  apiCapabilities: apiCapabilitiesSchema.optional(),
});
export type Profile = z.infer<typeof profileSchema>;

/** Result of POST /api/profiles/generate — explicit outcome for the UI. */
export type ProfileGenerationStatus = "success" | "partial" | "failed";

export type GenerateProfileResponse =
  | {
      status: "success" | "partial";
      profile: Profile;
    }
  | {
      status: "failed";
      message?: string;
      apiCapabilities?: ApiCapabilities;
    };

// Input schema for profile generation request
export const generateProfileRequestSchema = z.object({
  url: z.string().url(),
});
export type GenerateProfileRequest = z.infer<typeof generateProfileRequestSchema>;

// Crawled data from a URL
export const crawledDataSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()),
  links: z.array(z.string()),
  socialLinks: z.array(socialLinkSchema),
  textContent: z.string(),
  metadata: z.record(z.string()).optional(),
  videoUrls: z.array(z.string()).optional(),
});
export type CrawledData = z.infer<typeof crawledDataSchema>;

// AI synthesis result
export const synthesisResultSchema = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string(),
  yearsActive: z.string(),
  confidence: z.number(),
  projects: z.array(projectSchema),
  media: z.array(mediaItemSchema),
  platforms: z.array(z.enum(platformTypes)),
});
export type SynthesisResult = z.infer<typeof synthesisResultSchema>;

/** PATCH /api/profiles/:id — editable header / meta fields */
export const profileCorePatchSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  bio: z.string().optional(),
  yearsActive: z.string().optional(),
  platforms: z.array(z.enum(platformTypes)).optional(),
  socialLinks: z.array(socialLinkSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  projectCount: z.number().optional(),
});
export type ProfileCorePatch = z.infer<typeof profileCorePatchSchema>;

/** PATCH /api/profiles/:id/projects/:projectId */
export const projectFieldsPatchSchema = projectSchema.partial();
export type ProjectFieldsPatch = z.infer<typeof projectFieldsPatchSchema>;

/** POST /api/profiles/:id/projects — body without id (server assigns) */
export const projectCreateSchema = z.object({
  title: z.string().min(1),
  year: z.string().optional(),
  role: z.string().optional(),
  platform: z.enum(platformTypes).optional(),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  coverImage: z.string().optional(),
  collaborators: z.array(z.string()).optional(),
  hasVideo: z.boolean().optional(),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

/** PATCH /api/profiles/:id/media/:mediaId */
export const mediaItemPatchSchema = mediaItemSchema.partial();
export type MediaItemPatch = z.infer<typeof mediaItemPatchSchema>;
