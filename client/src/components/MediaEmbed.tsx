import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ExternalLink, Pencil } from "lucide-react";
import PlatformBadge, { type Platform } from "./PlatformBadge";
import SourceTag from "./SourceTag";
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
import type { MediaItem } from "@shared/schema";

interface MediaEmbedProps {
  id?: string;
  url: string;
  title: string;
  description?: string;
  platform: Platform;
  thumbnail?: string;
  profileId?: string;
  onMediaUpdated?: (item: MediaItem) => void;
}

export default function MediaEmbed({
  id,
  url,
  title,
  description,
  platform,
  thumbnail,
  profileId,
  onMediaUpdated,
}: MediaEmbedProps) {
  const [open, setOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftDescription, setDraftDescription] = useState(description || "");
  const [saving, setSaving] = useState(false);

  const handleClick = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftTitle(title);
    setDraftUrl(url);
    setDraftDescription(description || "");
    setOpen(true);
  };

  const saveEdit = async () => {
    if (!profileId || !id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          url: draftUrl.trim(),
          description: draftDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const { apiCapabilities: _a, ...rest } = data as MediaItem & {
          apiCapabilities?: unknown;
        };
        onMediaUpdated?.(rest as MediaItem);
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const editable = Boolean(profileId && id && onMediaUpdated);

  return (
    <>
      <Card
        className="overflow-hidden cursor-pointer hover-elevate relative"
        onClick={handleClick}
        data-testid="card-media-embed"
      >
        {editable && (
          <button
            type="button"
            onClick={openEdit}
            className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center opacity-80 hover:opacity-100"
            aria-label="Edit media"
          >
            <Pencil className="w-4 h-4 text-white" />
          </button>
        )}
        <div className="relative aspect-video bg-muted">
          {thumbnail ? (
            <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <PlatformBadge platform={platform} className="scale-150" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <ExternalLink className="w-7 h-7 text-foreground" />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium font-display line-clamp-1" data-testid="text-media-title">
              {title}
            </h4>
            <PlatformBadge platform={platform} />
          </div>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
          <SourceTag platform={platform} />
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit media</DialogTitle>
            <DialogDescription>Title, URL, and description</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="me-title">Title</Label>
              <Input id="me-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="me-url">Media URL</Label>
              <Input id="me-url" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="me-desc">Description</Label>
              <Textarea
                id="me-desc"
                rows={3}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={saving || !draftTitle.trim() || !draftUrl.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
