import { useState, type MouseEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PlatformBadge, { type Platform } from "./PlatformBadge";
import SourceTag from "./SourceTag";
import { Play, Users, Calendar, Pencil, ExternalLink, Settings2, Trash2 } from "lucide-react";
import type { Project as ProfileProject } from "@shared/schema";
import type { Profile } from "@shared/schema";

interface ProjectCardProps {
  id: string;
  title: string;
  year: string;
  role: string;
  coverImage?: string;
  platform: Platform;
  collaborators?: string[];
  hasVideo?: boolean;
  videoUrl?: string;
  sourceUrl?: string;
  description?: string;
  onPlay?: () => void;
  profileId?: string;
  onCoverUpdated?: (projectId: string, newCoverImage: string) => void;
  onProjectUpdated?: (project: ProfileProject) => void;
  onProfileUpdated?: (profile: Profile) => void;
}

export default function ProjectCard({
  id,
  title,
  year,
  role,
  coverImage,
  platform,
  collaborators = [],
  hasVideo = false,
  videoUrl,
  sourceUrl,
  description = "",
  onPlay,
  profileId,
  onCoverUpdated,
  onProjectUpdated,
  onProfileUpdated,
}: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCoverDialogOpen, setIsCoverDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);

  const [draftTitle, setDraftTitle] = useState(title);
  const [draftYear, setDraftYear] = useState(year);
  const [draftRole, setDraftRole] = useState(role);
  const [draftVideoUrl, setDraftVideoUrl] = useState(videoUrl || "");
  const [draftSourceUrl, setDraftSourceUrl] = useState(sourceUrl || "");
  const [draftDescription, setDraftDescription] = useState(description || "");
  const [draftCollaborators, setDraftCollaborators] = useState(collaborators.join(", "));
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const handleClick = () => {
    if (videoUrl) {
      window.open(videoUrl, "_blank", "noopener,noreferrer");
    } else if (sourceUrl) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
    } else if (hasVideo && onPlay) {
      onPlay();
    }
  };

  const handleEditCoverClick = (e: MouseEvent) => {
    e.stopPropagation();
    setNewCoverUrl(coverImage || "");
    setIsCoverDialogOpen(true);
  };

  const handleRemoveClick = (e: MouseEvent) => {
    e.stopPropagation();
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (!profileId) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/projects/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = (await res.json()) as Profile & { apiCapabilities?: unknown };
        const { apiCapabilities: _a, ...prof } = data;
        onProfileUpdated?.(prof as Profile);
        setRemoveOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemoving(false);
    }
  };

  const handleEditDetailsClick = (e: MouseEvent) => {
    e.stopPropagation();
    setDraftTitle(title);
    setDraftYear(year);
    setDraftRole(role);
    setDraftVideoUrl(videoUrl || "");
    setDraftSourceUrl(sourceUrl || "");
    setDraftDescription(description || "");
    setDraftCollaborators(collaborators.join(", "));
    setIsDetailDialogOpen(true);
  };

  const handleSaveCover = async () => {
    if (!profileId || !newCoverUrl.trim()) return;

    setIsUpdatingCover(true);
    try {
      const response = await fetch(`/api/profiles/${profileId}/projects/${id}/cover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: newCoverUrl.trim() }),
      });

      if (response.ok) {
        onCoverUpdated?.(id, newCoverUrl.trim());
        setIsCoverDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to update cover:", error);
    } finally {
      setIsUpdatingCover(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!profileId) return;
    setIsSavingDetails(true);
    try {
      const collabList = draftCollaborators
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        title: draftTitle.trim(),
        year: draftYear.trim(),
        role: draftRole.trim(),
        collaborators: collabList,
      };
      if (draftDescription.trim()) body.description = draftDescription.trim();
      else body.description = undefined;
      if (draftVideoUrl.trim()) body.videoUrl = draftVideoUrl.trim();
      else body.videoUrl = undefined;
      if (draftSourceUrl.trim()) body.sourceUrl = draftSourceUrl.trim();
      else body.sourceUrl = undefined;
      body.hasVideo = Boolean(draftVideoUrl.trim());

      const response = await fetch(`/api/profiles/${profileId}/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const data = await response.json();
        const { apiCapabilities: _a, ...proj } = data as ProfileProject & {
          apiCapabilities?: unknown;
        };
        onProjectUpdated?.(proj as ProfileProject);
        setIsDetailDialogOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <Card
      className="group overflow-visible cursor-pointer hover-elevate active-elevate-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      data-testid={`card-project-${id}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-t-md">
        {coverImage ? (
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
            <span className="text-4xl font-display font-bold text-muted-foreground/30">
              {title[0]}
            </span>
          </div>
        )}

        <div className="absolute top-3 right-3">
          <PlatformBadge platform={platform} />
        </div>

        {profileId && (
          <div className="absolute top-3 left-3 flex gap-1 z-20">
            <button
              type="button"
              onClick={handleEditCoverClick}
              className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-200"
              data-testid={`button-edit-cover-${id}`}
            >
              <Pencil className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={handleEditDetailsClick}
              className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-200"
              data-testid={`button-edit-project-${id}`}
            >
              <Settings2 className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={handleRemoveClick}
              className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-200"
              data-testid={`button-remove-project-${id}`}
              aria-label="Remove project"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {(hasVideo || videoUrl) && (
          <div
            className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-200 z-10 ${
              isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center hover-elevate active-elevate-2"
              data-testid={`button-play-${id}`}
            >
              <Play className="w-6 h-6 text-foreground fill-foreground ml-1" />
            </button>
          </div>
        )}

        {!hasVideo && !videoUrl && sourceUrl && (
          <div
            className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-200 z-10 ${
              isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center hover-elevate active-elevate-2"
              data-testid={`button-link-${id}`}
            >
              <ExternalLink className="w-6 h-6 text-foreground" />
            </button>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <h3
            className="text-lg font-medium text-white font-display line-clamp-1"
            data-testid={`text-project-title-${id}`}
          >
            {title}
          </h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {year}
          </span>
          <span className="font-medium text-foreground">{role}</span>
        </div>

        {collaborators.length > 0 && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{collaborators.slice(0, 2).join(", ")}</span>
            {collaborators.length > 2 && (
              <span className="text-xs">+{collaborators.length - 2}</span>
            )}
          </div>
        )}

        <SourceTag platform={platform} />
      </div>

      <Dialog open={isCoverDialogOpen} onOpenChange={setIsCoverDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit Cover Image</DialogTitle>
            <DialogDescription>Paste a URL to a new cover image for "{title}"</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="https://example.com/image.jpg"
              value={newCoverUrl}
              onChange={(e) => setNewCoverUrl(e.target.value)}
              data-testid="input-cover-url"
            />
            {newCoverUrl && (
              <div className="mt-4 aspect-video rounded-md overflow-hidden bg-muted">
                <img
                  src={newCoverUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCoverDialogOpen(false)}
              data-testid="button-cancel-cover"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCover}
              disabled={isUpdatingCover || !newCoverUrl.trim()}
              data-testid="button-save-cover"
            >
              {isUpdatingCover ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Title, dates, links, and credits</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor={`pt-${id}`}>Title</Label>
              <Input id={`pt-${id}`} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`py-${id}`}>Year</Label>
                <Input id={`py-${id}`} value={draftYear} onChange={(e) => setDraftYear(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`pr-${id}`}>Role</Label>
                <Input id={`pr-${id}`} value={draftRole} onChange={(e) => setDraftRole(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`pv-${id}`}>Video URL</Label>
              <Input
                id={`pv-${id}`}
                placeholder="https://youtube.com/..."
                value={draftVideoUrl}
                onChange={(e) => setDraftVideoUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`ps-${id}`}>Source / project URL</Label>
              <Input
                id={`ps-${id}`}
                placeholder="https://..."
                value={draftSourceUrl}
                onChange={(e) => setDraftSourceUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`pc-${id}`}>Collaborators (comma-separated)</Label>
              <Input
                id={`pc-${id}`}
                value={draftCollaborators}
                onChange={(e) => setDraftCollaborators(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`pd-${id}`}>Description</Label>
              <Textarea
                id={`pd-${id}`}
                rows={4}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveDetails} disabled={isSavingDetails || !draftTitle.trim()}>
              {isSavingDetails ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{title}&quot; from your profile. You can add a project again anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmRemove}
              disabled={removing}
            >
              {removing ? "Removing..." : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
