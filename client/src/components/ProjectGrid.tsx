import { useState } from "react";
import ProjectCard from "./ProjectCard";
import type { Project as ProfileProject } from "@shared/schema";
import type { Profile } from "@shared/schema";
import { Film, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { platformTypes } from "@shared/schema";
import type { Platform } from "./PlatformBadge";

interface ProjectGridProps {
  projects: ProfileProject[];
  title?: string;
  onPlayVideo?: (projectId: string) => void;
  profileId?: string;
  onCoverUpdated?: (projectId: string, newCoverImage: string) => void;
  onProjectUpdated?: (project: ProfileProject) => void;
  /** Called after add/remove when the server returns the full profile */
  onProfileUpdated?: (profile: Profile) => void;
}

export default function ProjectGrid({
  projects,
  title = "Featured Projects",
  onPlayVideo,
  profileId,
  onCoverUpdated,
  onProjectUpdated,
  onProfileUpdated,
}: ProjectGridProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftYear, setDraftYear] = useState("");
  const [draftRole, setDraftRole] = useState("Creator");
  const [draftPlatform, setDraftPlatform] = useState<Platform>("website");
  const [draftDescription, setDraftDescription] = useState("");

  const openAdd = () => {
    setDraftTitle("");
    setDraftYear("");
    setDraftRole("Creator");
    setDraftPlatform("website");
    setDraftDescription("");
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!profileId || !draftTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          year: draftYear.trim() || undefined,
          role: draftRole.trim() || undefined,
          platform: draftPlatform,
          description: draftDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as Profile & { apiCapabilities?: unknown };
        const { apiCapabilities: _a, ...prof } = data;
        onProfileUpdated?.(prof as Profile);
        setAddOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="py-12" data-testid="section-projects">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold font-display">{title}</h2>
          {profileId && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Add project
            </Button>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16 rounded-lg border border-dashed border-muted-foreground/25">
            <Film className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg text-muted-foreground mb-4">No projects yet</p>
            {profileId && (
              <Button type="button" variant="secondary" size="sm" onClick={openAdd}>
                Add your first project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                {...project}
                onPlay={() => onPlayVideo?.(project.id)}
                profileId={profileId}
                onCoverUpdated={onCoverUpdated}
                onProjectUpdated={onProjectUpdated}
                onProfileUpdated={onProfileUpdated}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription>Create a new entry on this profile. You can edit details anytime.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="add-title">Title</Label>
              <Input
                id="add-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="add-year">Year</Label>
                <Input
                  id="add-year"
                  value={draftYear}
                  onChange={(e) => setDraftYear(e.target.value)}
                  placeholder="e.g. 2024"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-role">Role</Label>
                <Input
                  id="add-role"
                  value={draftRole}
                  onChange={(e) => setDraftRole(e.target.value)}
                  placeholder="Your role"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Platform</Label>
              <Select value={draftPlatform} onValueChange={(v) => setDraftPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platformTypes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-desc">Description (optional)</Label>
              <Textarea
                id="add-desc"
                rows={3}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitAdd} disabled={saving || !draftTitle.trim()}>
              {saving ? "Adding..." : "Add project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
