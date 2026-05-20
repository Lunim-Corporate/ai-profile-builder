import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import URLInputForm from "@/components/URLInputForm";
import ProfileHeader from "@/components/ProfileHeader";
import ProjectGrid from "@/components/ProjectGrid";
import MediaGallery from "@/components/MediaGallery";
import LoadingState from "@/components/LoadingState";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Profile, GenerateProfileResponse, MediaItem } from "@shared/schema";

const AUTOFILL_FAILED_MESSAGE =
  "We couldn't build a profile from that link. Try a different URL — for example an IMDb, TMDB, YouTube, or Vimeo profile page.";

const floatingOrbs = [
  { size: 300, x: "10%", y: "20%", delay: 0, color: "hsl(217 91% 60% / 0.3)" },
  { size: 200, x: "80%", y: "10%", delay: 2, color: "hsl(280 65% 60% / 0.25)" },
  { size: 250, x: "70%", y: "60%", delay: 4, color: "hsl(173 58% 39% / 0.2)" },
  { size: 180, x: "20%", y: "70%", delay: 6, color: "hsl(280 65% 60% / 0.2)" },
];

type AppState = "input" | "loading" | "profile";
type LoadingStage = "crawling" | "aggregating" | "synthesizing" | "building";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("input");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("crawling");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [footerNote, setFooterNote] = useState("");

  const generateMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/profiles/generate", { url });
      // Server may return wrapped `{ status, profile }` or legacy bare `Profile`.
      return response.json() as Promise<GenerateProfileResponse | Profile>;
    },
    onSuccess: (data) => {
      if ("status" in data && data.status === "failed") {
        setErrorMessage(data.message?.trim() || AUTOFILL_FAILED_MESSAGE);
        setAppState("input");
        return;
      }
      const profile: Profile | null =
        "profile" in data && data.profile
          ? data.profile
          : "id" in data && "urlHash" in data
            ? (data as Profile)
            : null;
      if (!profile) {
        setErrorMessage(AUTOFILL_FAILED_MESSAGE);
        setAppState("input");
        return;
      }
      setProfile(profile);
      setAppState("profile");
    },
    onError: (error) => {
      console.error("Generation failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to generate profile");
      setAppState("input");
    },
  });

  const handleSubmit = async (url: string) => {
    setAppState("loading");
    setErrorMessage("");
    
    // Simulate stage progression while waiting for API
    const stages: LoadingStage[] = ["crawling", "aggregating", "synthesizing", "building"];
    let stageIndex = 0;
    
    const stageInterval = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, stages.length - 1);
      setLoadingStage(stages[stageIndex]);
    }, 3000);

    try {
      await generateMutation.mutateAsync(url);
    } finally {
      clearInterval(stageInterval);
    }
  };

  const handleReset = () => {
    setAppState("input");
    setProfile(null);
    setErrorMessage("");
  };

  const handlePlayVideo = (projectId: string) => {
    console.log("Playing video for project:", projectId);
  };

  const handleCoverUpdated = (projectId: string, newCoverImage: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      projects: profile.projects.map(p =>
        p.id === projectId ? { ...p, coverImage: newCoverImage } : p
      ),
    });
  };

  const handleProfileImageUpdated = (newImageUrl: string) => {
    if (!profile) return;
    setProfile({
      ...profile,
      imageUrl: newImageUrl,
    });
  };

  const handleProfileUpdated = (updated: Profile) => {
    setProfile(updated);
  };

  const handleProjectUpdated = (proj: Profile["projects"][number]) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        projects: prev.projects.map((p) => (p.id === proj.id ? { ...p, ...proj } : p)),
        projectCount: prev.projects.length,
      };
    });
  };

  const handleMediaUpdated = (item: MediaItem) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        media: prev.media.map((m) => (m.id === item.id ? { ...m, ...item } : m)),
      };
    });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (!profile?.id) return;
    setFooterNote(`Data sourced from ${profile.platforms.join(", ")}.`);
  }, [profile?.id]);

  // Handle scroll for back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 font-display font-bold text-lg hover-elevate active-elevate-2 rounded-md px-2 py-1"
            data-testid="button-logo"
          >
            <Sparkles className="w-5 h-5 text-primary" />
            Tabb Profile Builder
          </button>
          
          <div className="flex items-center gap-2">
            {appState === "profile" && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleReset}
                data-testid="button-new-profile"
              >
                New Profile
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        {appState === "input" && (
          <div className="relative min-h-[calc(100vh-3.5rem)] flex items-center justify-center overflow-hidden">
            {/* Animated gradient background */}
            <div className="absolute inset-0 animated-gradient-bg" />
            
            {/* Floating orbs */}
            {floatingOrbs.map((orb, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full floating-orb pointer-events-none"
                style={{
                  width: orb.size,
                  height: orb.size,
                  left: orb.x,
                  top: orb.y,
                  background: `radial-gradient(circle, ${orb.color}, transparent 70%)`,
                  filter: "blur(40px)",
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.5, delay: orb.delay * 0.1 }}
              />
            ))}
            
            {/* Content */}
            <div className="relative z-10 py-20 md:py-32 w-full">
              <motion.div 
                className="max-w-4xl mx-auto px-6 text-center mb-12"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold font-display tracking-tight mb-6 gradient-text">
                  AI Profile Builder
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                  Transform your portfolio into a stunning professional profile
                </p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <URLInputForm
                  onSubmit={handleSubmit}
                  isLoading={generateMutation.isPending}
                  serverError={errorMessage}
                  onDismissServerError={() => setErrorMessage("")}
                />
              </motion.div>
            </div>
          </div>
        )}

        {appState === "loading" && (
          <LoadingState stage={loadingStage} />
        )}

        {appState === "profile" && profile && (
          <>
            <ProfileHeader 
              name={profile.name}
              role={profile.role}
              bio={profile.bio}
              imageUrl={profile.imageUrl}
              projectCount={profile.projectCount}
              yearsActive={profile.yearsActive}
              platforms={profile.platforms}
              socialLinks={profile.socialLinks}
              profileId={profile.id}
              onImageUpdated={handleProfileImageUpdated}
              onProfileUpdated={handleProfileUpdated}
            />
            
            <div className="border-t" />
            
            <ProjectGrid 
              projects={profile.projects} 
              title="Featured Projects"
              onPlayVideo={handlePlayVideo}
              profileId={profile.id}
              onCoverUpdated={handleCoverUpdated}
              onProjectUpdated={handleProjectUpdated}
              onProfileUpdated={handleProfileUpdated}
            />
            
            <div className="border-t" />
            <MediaGallery
              items={profile.media}
              title="Videos"
              profileId={profile.id}
              onMediaUpdated={handleMediaUpdated}
            />
            
            <div className="py-12">
              <div className="max-w-3xl mx-auto px-6">
                <Textarea
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  className="text-sm text-muted-foreground min-h-[80px] resize-y border-dashed bg-transparent text-center"
                  aria-label="Footer attribution note"
                />
              </div>
            </div>
          </>
        )}
      </main>

      {showScrollTop && (
        <Button
          size="icon"
          variant="secondary"
          className="fixed bottom-6 right-6 z-40 shadow-lg"
          onClick={scrollToTop}
          data-testid="button-scroll-top"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
