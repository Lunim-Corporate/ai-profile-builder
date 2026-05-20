import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import PlatformBadge, { type Platform } from "./PlatformBadge";
import { Film, Calendar, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import type { Profile } from "@shared/schema";
import { platformTypes } from "@shared/schema";

interface SocialLink {
  platform: Platform;
  url: string;
}

interface ProfileHeaderProps {
  name: string;
  role: string;
  bio: string;
  imageUrl?: string;
  projectCount: number;
  yearsActive: string;
  platforms: Platform[];
  socialLinks: SocialLink[];
  profileId?: string;
  onImageUpdated?: (newImageUrl: string) => void;
  onProfileUpdated?: (profile: Profile) => void;
}

export default function ProfileHeader({
  name,
  role,
  bio,
  imageUrl,
  projectCount,
  yearsActive,
  platforms,
  socialLinks,
  profileId,
  onImageUpdated,
  onProfileUpdated,
}: ProfileHeaderProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [isMetaOpen, setIsMetaOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftRole, setDraftRole] = useState(role);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftYears, setDraftYears] = useState(yearsActive);
  const [draftSocials, setDraftSocials] = useState<SocialLink[]>(socialLinks);
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleEditClick = () => {
    setNewImageUrl(imageUrl || "");
    setIsEditDialogOpen(true);
  };

  const handleSaveImage = async () => {
    if (!profileId || !newImageUrl.trim()) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/profiles/${profileId}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: newImageUrl.trim() }),
      });

      if (response.ok) {
        onImageUpdated?.(newImageUrl.trim());
        setIsEditDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to update image:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const openMetaEdit = () => {
    setDraftName(name);
    setDraftRole(role);
    setDraftBio(bio);
    setDraftYears(yearsActive);
    setDraftSocials(socialLinks.length ? [...socialLinks] : [{ platform: "website", url: "" }]);
    setIsMetaOpen(true);
  };

  const saveMeta = async () => {
    if (!profileId) return;
    const cleanedSocials = draftSocials.filter((s) => s.url.trim());
    setIsSavingMeta(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          role: draftRole.trim(),
          bio: draftBio.trim(),
          yearsActive: draftYears.trim(),
          socialLinks: cleanedSocials.filter((s) => {
            try {
              return Boolean(new URL(s.url.trim()));
            } catch {
              return false;
            }
          }),
          platforms:
            cleanedSocials.length > 0
              ? [...new Set(cleanedSocials.map((s) => s.platform))]
              : ["website"],
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Profile;
        onProfileUpdated?.(updated);
        setIsMetaOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const addSocialRow = () => {
    setDraftSocials([...draftSocials, { platform: "website", url: "" }]);
  };

  const removeSocialRow = (index: number) => {
    setDraftSocials(draftSocials.filter((_, i) => i !== index));
  };

  const updateSocialRow = (index: number, patch: Partial<SocialLink>) => {
    setDraftSocials(
      draftSocials.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  return (
    <header className="py-12 md:py-16" data-testid="section-profile-header">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
          <div className="relative mx-auto md:mx-0">
            <Avatar className="w-32 h-32 md:w-48 md:h-48 shadow-lg">
              <AvatarImage src={imageUrl} alt={name} />
              <AvatarFallback className="text-3xl md:text-5xl font-display bg-gradient-to-br from-primary/20 to-primary/40">
                {initials}
              </AvatarFallback>
            </Avatar>

            {profileId && (
              <button
                type="button"
                onClick={handleEditClick}
                className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-200"
                data-testid="button-edit-profile-image"
              >
                <Pencil className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          <div className="text-center md:text-left space-y-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="space-y-2 flex-1">
                <h1
                  className="text-4xl md:text-5xl lg:text-6xl font-bold font-display tracking-tight"
                  data-testid="text-profile-name"
                >
                  {name}
                </h1>
                <p className="text-xl md:text-2xl text-muted-foreground font-medium">{role}</p>
              </div>
              {profileId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={openMetaEdit}
                  data-testid="button-edit-profile-details"
                >
                  <Pencil className="w-4 h-4" />
                  Edit details
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Film className="w-4 h-4" />
                {projectCount} Projects
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {yearsActive}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                {platforms.length} Platforms
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              {socialLinks.map((link) => (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover-elevate active-elevate-2 rounded-md"
                  data-testid={`link-social-${link.platform}`}
                >
                  <PlatformBadge platform={link.platform} />
                </a>
              ))}
            </div>

            <p
              className="max-w-3xl text-base leading-relaxed text-foreground/90"
              data-testid="text-profile-bio"
            >
              {bio}
            </p>
          </div>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit Profile Picture</DialogTitle>
            <DialogDescription>Paste a URL to a new profile picture for {name}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="https://example.com/image.jpg"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              data-testid="input-profile-image-url"
            />
            {newImageUrl && (
              <div className="mt-4 flex justify-center">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={newImageUrl} alt="Preview" />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              data-testid="button-cancel-profile-image"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveImage}
              disabled={isUpdating || !newImageUrl.trim()}
              data-testid="button-save-profile-image"
            >
              {isUpdating ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMetaOpen} onOpenChange={setIsMetaOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Name, role, bio, activity range, and social links
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pf-name">Name</Label>
              <Input id="pf-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pf-role">Role</Label>
              <Input id="pf-role" value={draftRole} onChange={(e) => setDraftRole(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pf-years">Years active</Label>
              <Input id="pf-years" value={draftYears} onChange={(e) => setDraftYears(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pf-bio">Bio</Label>
              <Textarea
                id="pf-bio"
                rows={5}
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Social links</Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1 h-8" onClick={addSocialRow}>
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {draftSocials.map((row, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Select
                      value={row.platform}
                      onValueChange={(v) => updateSocialRow(i, { platform: v as Platform })}
                    >
                      <SelectTrigger className="w-[140px] shrink-0">
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
                    <Input
                      className="flex-1"
                      placeholder="https://..."
                      value={row.url}
                      onChange={(e) => updateSocialRow(i, { url: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeSocialRow(i)}
                      aria-label="Remove link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setIsMetaOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveMeta} disabled={isSavingMeta || !draftName.trim()}>
              {isSavingMeta ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
