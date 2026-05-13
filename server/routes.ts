import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import { generateProfileRequestSchema } from "@shared/schema";
import type { Profile, SynthesisResult, CrawledData, ProfileGenerationStatus, Platform, MediaItem } from "@shared/schema";
import { crawlUrl, crawlHasUsableContent, normalizeUrl, hashUrl } from "./services/crawler";
import { searchWithPerplexity } from "./services/perplexity";
import { synthesizeProfile } from "./services/gemini";
import { enrichProjectsWithPosters, searchPerson } from "./services/tmdb";
import { fetchChannelVideos, searchYouTubeForProject } from "./services/youtube";
import { getVimeoThumbnail, isVimeoUrl, fetchVimeoUserVideos, VimeoVideo, searchVimeoForProject } from "./services/vimeo";
import { getApiCapabilities, getMissingRequiredEnvVars, isProfilePipelineDebugEnabled } from "./env";
import { summarizeCrawledForDebug, logPipelineStage } from "./pipelineDebug";

function classifyGeneration(
  synthesis: SynthesisResult,
  crawledData: CrawledData,
): Exclude<ProfileGenerationStatus, "failed"> {
  const nameBad = /^unknown$/i.test(synthesis.name.trim());
  const thin =
    synthesis.projects.length === 0 &&
    synthesis.media.length === 0;
  const shortCrawl = crawledData.textContent.trim().length < 100;

  if (synthesis.confidence < 0.5) return "partial";
  if (nameBad && thin) return "partial";
  if (nameBad && shortCrawl) return "partial";

  return "success";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Generate a new profile from URL
  app.post("/api/profiles/generate", async (req, res) => {
    try {
      const parsed = generateProfileRequestSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const missingEnvVars = getMissingRequiredEnvVars();
      if (missingEnvVars.length > 0) {
        return res.status(503).json({
          error: "Server is missing required API keys for profile generation.",
          missingEnvVars,
          capabilities: getApiCapabilities(),
        });
      }

      const { url } = parsed.data;
      const normalizedUrl = normalizeUrl(url);
      const urlHash = hashUrl(normalizedUrl);
      const debugPipeline = isProfilePipelineDebugEnabled();
      const timingsMs: Record<string, number> = {};

      // Check if we already have this profile cached
      const existingProfile = await storage.getProfileByUrlHash(urlHash);
      if (existingProfile) {
        if (debugPipeline) {
          logPipelineStage("CACHE HIT — skipped crawl / AI / APIs", {
            normalizedUrl,
            urlHash,
            profileId: existingProfile.id,
          });
        }
        return res.json({
          status: "success" as const,
          profile: {
            ...existingProfile,
            apiCapabilities: getApiCapabilities(),
          },
        });
      }

      // Step 1: Crawl the URL
      console.log("Crawling URL:", normalizedUrl);
      const tCrawl = Date.now();
      const crawledData = await crawlUrl(normalizedUrl);
      if (debugPipeline) timingsMs.crawl = Date.now() - tCrawl;

      if (!crawlHasUsableContent(crawledData)) {
        console.log("Crawl produced no usable content; skipping profile save");
        if (debugPipeline) {
          logPipelineStage("FAILED — crawl had no usable content", {
            normalizedUrl,
            urlHash,
            timingsMs,
            crawl: summarizeCrawledForDebug(crawledData),
          });
        }
        return res.json({
          status: "failed" as const,
          message:
            "We couldn't autofill from that link — try a different URL, paste your text, or fill in your profile manually.",
          apiCapabilities: getApiCapabilities(),
        });
      }

      if (debugPipeline) {
        logPipelineStage("Step 1 — Crawl (usable content)", {
          normalizedUrl,
          urlHash,
          crawlMs: timingsMs.crawl,
          crawl: summarizeCrawledForDebug(crawledData),
        });
      }

      // Step 2: Enrich with Perplexity search
      console.log("Enriching with Perplexity...");
      const nameHint = crawledData.title?.split(/[-–|]/)[0].trim() || "";
      const tPerplexity = Date.now();
      const { enrichment: enrichmentData, debug: perplexityDebug } =
        await searchWithPerplexity(nameHint, crawledData.textContent, {
          captureDebug: debugPipeline,
        });
      if (debugPipeline) timingsMs.perplexity = Date.now() - tPerplexity;

      if (debugPipeline) {
        logPipelineStage("Step 2 — Perplexity", {
          nameHint,
          perplexityMs: timingsMs.perplexity,
          enrichment: {
            success: enrichmentData.success,
            additionalInfoLength: enrichmentData.additionalInfo.length,
            additionalInfoPreview: enrichmentData.additionalInfo.slice(0, 2000),
            projectsParsed: enrichmentData.projects,
            collaboratorsParsed: enrichmentData.collaborators,
          },
          perplexityApi: perplexityDebug ?? null,
        });
      }

      // Step 3: Synthesize with Gemini
      console.log("Synthesizing with Gemini...");
      const tGemini = Date.now();
      const { synthesis: synthesisResult, debug: geminiDebug } = await synthesizeProfile(
        crawledData,
        enrichmentData,
        { captureDebug: debugPipeline },
      );
      if (debugPipeline) timingsMs.gemini = Date.now() - tGemini;

      if (debugPipeline) {
        logPipelineStage("Step 3 — Gemini synthesis", {
          geminiMs: timingsMs.gemini,
          synthesis: synthesisResult,
          geminiApi: geminiDebug ?? null,
        });
      }

      // Step 4: Enrich projects with TMDB posters
      console.log("Enriching with TMDB posters...");
      const tTmdbPosters = Date.now();
      const enrichedProjects = await enrichProjectsWithPosters(synthesisResult.projects);
      if (debugPipeline) timingsMs.tmdbPosters = Date.now() - tTmdbPosters;

      if (debugPipeline) {
        logPipelineStage("Step 4 — TMDB project posters", {
          tmdbPostersMs: timingsMs.tmdbPosters,
          projectCount: enrichedProjects.length,
          projectsWithCoverAfterTmdb: enrichedProjects.filter((p) => Boolean(p.coverImage)).length,
          projects: enrichedProjects.map((p) => ({
            id: p.id,
            title: p.title,
            year: p.year,
            hasCover: Boolean(p.coverImage),
          })),
        });
      }

      // Step 5: Fetch YouTube videos if channel URL exists
      console.log("Fetching YouTube videos...");
      let mediaItems = [...synthesisResult.media];
      let youtubeVideos: { url: string; title: string; thumbnail: string; publishedAt: string }[] = [];
      const youtubeLink = crawledData.socialLinks.find(l => l.platform === 'youtube');
      const tYoutube = Date.now();
      if (youtubeLink) {
        youtubeVideos = await fetchChannelVideos(youtubeLink.url);
        const videoMedia: MediaItem[] = youtubeVideos.map((video) => ({
          id: randomUUID(),
          url: video.url,
          title: video.title,
          thumbnail: video.thumbnail,
          platform: "youtube",
        }));
        mediaItems = [...videoMedia, ...mediaItems.filter(m => !m.url.includes('youtube.com'))];
      }
      if (debugPipeline) timingsMs.youtubeChannelMs = Date.now() - tYoutube;

      if (debugPipeline) {
        logPipelineStage("Step 5 — YouTube channel fetch", {
          youtubeChannelMs: timingsMs.youtubeChannelMs,
          socialLinkFound: Boolean(youtubeLink),
          channelUrl: youtubeLink?.url ?? null,
          videosFetched: youtubeVideos.length,
          videos: youtubeVideos.map((v) => ({
            title: v.title,
            url: v.url,
            publishedAt: v.publishedAt,
          })),
        });
      }

      // Step 5b: Fetch Vimeo videos if channel URL exists
      console.log("Fetching Vimeo videos...");
      let vimeoVideos: VimeoVideo[] = [];
      const vimeoLink = crawledData.socialLinks.find(l => l.platform === 'vimeo');
      const tVimeo = Date.now();
      if (vimeoLink) {
        vimeoVideos = await fetchVimeoUserVideos(vimeoLink.url);
        const vimeoMedia: MediaItem[] = vimeoVideos.map((video) => ({
          id: randomUUID(),
          url: video.url,
          title: video.title,
          thumbnail: video.thumbnail,
          platform: "vimeo",
        }));
        mediaItems = [...mediaItems, ...vimeoMedia.filter(vm => !mediaItems.some(m => m.url === vm.url))];
      }
      if (debugPipeline) timingsMs.vimeoChannelMs = Date.now() - tVimeo;

      if (debugPipeline) {
        logPipelineStage("Step 6 — Vimeo channel fetch", {
          vimeoChannelMs: timingsMs.vimeoChannelMs,
          socialLinkFound: Boolean(vimeoLink),
          channelUrl: vimeoLink?.url ?? null,
          videosFetched: vimeoVideos.length,
          videos: vimeoVideos.map((v) => ({
            title: v.title,
            url: v.url,
            createdAt: v.createdAt,
          })),
        });
      }

      // Step 6: Enrich projects with YouTube/Vimeo thumbnails as fallback cover images
      console.log("Enriching projects with video thumbnails...");
      const tThumbPass = Date.now();
      const finalProjects = await Promise.all(enrichedProjects.map(async (project) => {
        if (project.coverImage) return project;
        
        // Try to find a matching YouTube video by title similarity
        const projectTitleLower = project.title.toLowerCase();
        const matchingVideo = youtubeVideos.find(video => {
          const videoTitleLower = video.title.toLowerCase();
          return videoTitleLower.includes(projectTitleLower) || 
                 projectTitleLower.includes(videoTitleLower.split('|')[0].trim()) ||
                 projectTitleLower.split(/[\s-]+/).some(word => 
                   word.length > 3 && videoTitleLower.includes(word)
                 );
        });
        
        if (matchingVideo) {
          console.log(`Using YouTube thumbnail for project: ${project.title}`);
          return { ...project, coverImage: matchingVideo.thumbnail };
        }
        
        // If project has a videoUrl that's a YouTube link, extract thumbnail
        if (project.videoUrl?.includes('youtube.com/watch')) {
          const videoId = project.videoUrl.split('v=')[1]?.split('&')[0];
          if (videoId) {
            console.log(`Using YouTube videoUrl thumbnail for project: ${project.title}`);
            return { ...project, coverImage: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
          }
        }
        
        // Try to find a matching Vimeo video by title similarity
        const matchingVimeoVideo = vimeoVideos.find(video => {
          const videoTitleLower = video.title.toLowerCase();
          return videoTitleLower.includes(projectTitleLower) || 
                 projectTitleLower.includes(videoTitleLower.split('|')[0].trim()) ||
                 projectTitleLower.split(/[\s-]+/).some(word => 
                   word.length > 3 && videoTitleLower.includes(word)
                 );
        });
        
        if (matchingVimeoVideo && matchingVimeoVideo.thumbnail) {
          console.log(`Using Vimeo channel thumbnail for project: ${project.title}`);
          return { ...project, coverImage: matchingVimeoVideo.thumbnail };
        }
        
        // Fallback: Try Vimeo oEmbed if project has a Vimeo videoUrl
        if (project.videoUrl && isVimeoUrl(project.videoUrl)) {
          const vimeoThumb = await getVimeoThumbnail(project.videoUrl);
          if (vimeoThumb) {
            console.log(`Using Vimeo oEmbed thumbnail for project: ${project.title}`);
            return { ...project, coverImage: vimeoThumb };
          }
        }
        
        return project;
      }));
      if (debugPipeline) timingsMs.projectThumbnailPassMs = Date.now() - tThumbPass;

      if (debugPipeline) {
        logPipelineStage("Step 7 — Project cover thumbnails (YouTube/Vimeo/oEmbed)", {
          projectThumbnailPassMs: timingsMs.projectThumbnailPassMs,
          projectCount: finalProjects.length,
          coversPresent: finalProjects.filter((p) => Boolean(p.coverImage)).length,
        });
      }

      // Step 6b: Enrich projects with video URLs (trailers for movies/shows, full videos for shorts)
      console.log("Searching for video URLs on YouTube/Vimeo...");
      const tVideoSearch = Date.now();
      const projectsWithVideos = await Promise.all(finalProjects.map(async (project) => {
        // Skip if project already has a video URL
        if (project.videoUrl) {
          return project;
        }
        
        // Determine project type based on role and title keywords
        const roleLower = (project.role || "").toLowerCase();
        const titleLower = project.title.toLowerCase();
        
        // Check if it's a short film/animation
        const isShort = roleLower.includes("short") || 
                       titleLower.includes("short") ||
                       roleLower.includes("animation") ||
                       titleLower.includes("animation") ||
                       project.projectType === "short_film" ||
                       project.projectType === "animation";
        
        const projectType = isShort ? "short" : "trailer";
        
        // First, check if we already have a matching video from channel videos
        const matchingYouTube = youtubeVideos.find(video => {
          const videoTitleLower = video.title.toLowerCase();
          return videoTitleLower.includes(titleLower) || 
                 titleLower.includes(videoTitleLower.split('|')[0].trim()) ||
                 titleLower.split(/[\s-]+/).filter(w => w.length > 3).some(word => 
                   videoTitleLower.includes(word)
                 );
        });
        
        if (matchingYouTube) {
          console.log(`Found channel video for "${project.title}": ${matchingYouTube.url}`);
          return { ...project, videoUrl: matchingYouTube.url, hasVideo: true };
        }
        
        const matchingVimeo = vimeoVideos.find(video => {
          const videoTitleLower = video.title.toLowerCase();
          return videoTitleLower.includes(titleLower) || 
                 titleLower.includes(videoTitleLower.split('|')[0].trim()) ||
                 titleLower.split(/[\s-]+/).filter(w => w.length > 3).some(word => 
                   videoTitleLower.includes(word)
                 );
        });
        
        if (matchingVimeo) {
          console.log(`Found Vimeo channel video for "${project.title}": ${matchingVimeo.url}`);
          return { ...project, videoUrl: matchingVimeo.url, hasVideo: true };
        }
        
        // Search YouTube for the project
        const youtubeResult = await searchYouTubeForProject(project.title, projectType);
        if (youtubeResult) {
          console.log(`Found YouTube ${projectType} for "${project.title}": ${youtubeResult.url}`);
          return { 
            ...project, 
            videoUrl: youtubeResult.url, 
            hasVideo: true,
            coverImage: project.coverImage || youtubeResult.thumbnail
          };
        }
        
        // Fallback to Vimeo search
        const vimeoResult = await searchVimeoForProject(project.title, projectType);
        if (vimeoResult) {
          console.log(`Found Vimeo ${projectType} for "${project.title}": ${vimeoResult.url}`);
          return { 
            ...project, 
            videoUrl: vimeoResult.url, 
            hasVideo: true,
            coverImage: project.coverImage || vimeoResult.thumbnail
          };
        }
        
        return project;
      }));
      if (debugPipeline) timingsMs.projectVideoSearchMs = Date.now() - tVideoSearch;

      if (debugPipeline) {
        logPipelineStage("Step 8 — Project video URLs (channel match + YouTube/Vimeo search)", {
          projectVideoSearchMs: timingsMs.projectVideoSearchMs,
          projects: projectsWithVideos.map((p) => ({
            id: p.id,
            title: p.title,
            videoUrl: p.videoUrl ?? null,
            hasVideo: Boolean(p.hasVideo || p.videoUrl),
          })),
        });
      }

      // Step 7: Find person's profile image from TMDB
      console.log("Searching for person profile image...");
      let profileImageUrl: string | undefined = undefined;
      let usedTmdbHeadshot = false;
      const tPerson = Date.now();
      
      if (synthesisResult.name) {
        const tmdbPersonImage = await searchPerson(synthesisResult.name);
        if (tmdbPersonImage) {
          profileImageUrl = tmdbPersonImage;
          usedTmdbHeadshot = true;
          console.log(`Using TMDB person image for ${synthesisResult.name}`);
        }
      }
      
      // Fallback to crawled image if no TMDB person image found
      if (!profileImageUrl && crawledData.images.length > 0) {
        profileImageUrl = crawledData.images[0];
        console.log("Using crawled image as fallback");
      }
      if (debugPipeline) timingsMs.tmdbPersonImageMs = Date.now() - tPerson;

      if (debugPipeline) {
        logPipelineStage("Step 9 — Headshot (TMDB person search + crawl fallback)", {
          tmdbPersonImageMs: timingsMs.tmdbPersonImageMs,
          searchedName: synthesisResult.name,
          usedTmdbPersonImage: usedTmdbHeadshot,
          resolvedImageUrl: profileImageUrl ?? null,
        });
      }

      // Step 8: Build the final profile
      // Only use platforms that we actually found links for (from crawled social links)
      const actualPlatforms: Platform[] =
        crawledData.socialLinks.length > 0
          ? Array.from(new Set(crawledData.socialLinks.map((link) => link.platform)))
          : ["website"];

      const profile: Profile = {
        id: randomUUID(),
        urlHash,
        sourceUrl: normalizedUrl,
        name: synthesisResult.name,
        role: synthesisResult.role,
        bio: synthesisResult.bio,
        imageUrl: profileImageUrl,
        projectCount: projectsWithVideos.length,
        yearsActive: synthesisResult.yearsActive,
        platforms: actualPlatforms,
        socialLinks: crawledData.socialLinks.length > 0 
          ? crawledData.socialLinks 
          : [{ platform: "website" as const, url: normalizedUrl }],
        confidence: synthesisResult.confidence,
        projects: projectsWithVideos,
        media: mediaItems,
        crawledData: {
          title: crawledData.title,
          description: crawledData.description,
          imageCount: crawledData.images.length,
        },
        createdAt: new Date().toISOString(),
        apiCapabilities: getApiCapabilities(),
      };

      // Store the profile
      await storage.createProfile(profile);

      const generationStatus = classifyGeneration(synthesisResult, crawledData);
      console.log("Profile created:", profile.id, "generationStatus:", generationStatus);

      if (debugPipeline) {
        logPipelineStage("DONE — timings + final profile summary", {
          profileId: profile.id,
          generationStatus,
          timingsMs,
          mediaCount: mediaItems.length,
          profileSummary: {
            name: profile.name,
            role: profile.role,
            confidence: profile.confidence,
            projectCount: profile.projectCount,
            platforms: profile.platforms,
          },
        });
      }

      return res.json({
        status: generationStatus,
        profile,
      });
    } catch (error) {
      console.error("Profile generation error:", error);
      return res.status(500).json({ 
        error: "Failed to generate profile",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get a profile by ID
  app.get("/api/profiles/:id", async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.id);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      return res.json({
        ...profile,
        apiCapabilities: getApiCapabilities(),
      });
    } catch (error) {
      console.error("Get profile error:", error);
      return res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Get all profiles
  app.get("/api/profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllProfiles();
      return res.json(profiles);
    } catch (error) {
      console.error("Get profiles error:", error);
      return res.status(500).json({ error: "Failed to get profiles" });
    }
  });

  // Update profile image
  app.patch("/api/profiles/:profileId/image", async (req, res) => {
    try {
      const { profileId } = req.params;
      const { imageUrl } = req.body;
      
      if (!imageUrl || typeof imageUrl !== 'string') {
        return res.status(400).json({ error: "imageUrl is required" });
      }
      
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      profile.imageUrl = imageUrl;
      await storage.updateProfile(profile.id, profile);
      
      return res.json({ imageUrl });
    } catch (error) {
      console.error("Update profile image error:", error);
      return res.status(500).json({ error: "Failed to update profile image" });
    }
  });

  // Update project cover image
  app.patch("/api/profiles/:profileId/projects/:projectId/cover", async (req, res) => {
    try {
      const { profileId, projectId } = req.params;
      const { coverImage } = req.body;
      
      if (!coverImage || typeof coverImage !== 'string') {
        return res.status(400).json({ error: "coverImage URL is required" });
      }
      
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const projectIndex = profile.projects.findIndex(p => p.id === projectId);
      if (projectIndex === -1) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      profile.projects[projectIndex] = {
        ...profile.projects[projectIndex],
        coverImage,
        coverImageLocked: true,
      };
      
      await storage.updateProfile(profile.id, profile);
      return res.json(profile.projects[projectIndex]);
    } catch (error) {
      console.error("Update project cover error:", error);
      return res.status(500).json({ error: "Failed to update cover image" });
    }
  });

  return httpServer;
}
