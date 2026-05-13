import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, Loader2, Video, ArrowRight, AlertCircle } from "lucide-react";

interface URLInputFormProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
  /** Shown below the title when generation fails — keeps user on this card. */
  serverError?: string;
  onDismissServerError?: () => void;
}

export default function URLInputForm({
  onSubmit,
  isLoading = false,
  serverError,
  onDismissServerError,
}: URLInputFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const validateUrl = (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    if (!validateUrl(normalizedUrl)) {
      setError("Please enter a valid URL");
      return;
    }

    onSubmit(normalizedUrl);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto glass-card" data-testid="card-url-input">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Video className="w-6 h-6 text-primary" />
        </div>
        <CardTitle className="text-2xl md:text-3xl font-display">
          Enhanced Profile Analysis
        </CardTitle>
        <CardDescription className="text-base">
          Transform your portfolio into a stunning professional profile
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError ? (
          <div
            role="alert"
            className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-left text-sm text-foreground"
            data-testid="banner-generation-error"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" aria-hidden />
            <p className="leading-relaxed">{serverError}</p>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Link className="w-5 h-5" />
            </div>
            <Input
              type="text"
              placeholder="https://yourportfolio.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                onDismissServerError?.();
              }}
              className="pl-11 h-12 text-base"
              disabled={isLoading}
              data-testid="input-url"
            />
          </div>
          
          {error && (
            <p className="text-sm text-destructive" data-testid="text-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full gap-2 glow-button"
            disabled={isLoading}
            data-testid="button-generate"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Profile...
              </>
            ) : (
              <>
                Generate Profile
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

      </CardContent>
    </Card>
  );
}
