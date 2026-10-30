import { useEffect, useState } from "react";
import { ImagePlus, PenLine, Type, X } from "lucide-react";
import { DrawingNotebook } from "./drawing/DrawingNotebook";
import type { DrawingNotebook as DrawingNotebookData } from "../lib/drawingNotebook";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

type AnswerMode = "text" | "notebook" | "image";

/** Switch between the three ways of preparing a response to a question. */
export function QuestionAnswerInput({
  questionId,
  notebookAttemptId,
  text,
  image,
  onTextChange,
  onImageChange,
  disabled = false,
  captureResponse = true,
  notebookOnly = false,
  placeholder = "Write your working and answer…",
  onNotebookChange,
}: {
  questionId: string;
  notebookAttemptId?: string;
  text: string;
  image: string;
  onTextChange(value: string): void;
  onImageChange(value: string): void;
  onNotebookChange?: (notebook: DrawingNotebookData) => void;
  disabled?: boolean;
  captureResponse?: boolean;
  /** For objective questions, show the persistent working notebook without response tabs. */
  notebookOnly?: boolean;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<AnswerMode>(notebookOnly ? "notebook" : "text");
  const [notebookVisited, setNotebookVisited] = useState(notebookOnly);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => { setMode(notebookOnly ? "notebook" : "text"); setNotebookVisited(notebookOnly); setImageError(null); }, [questionId, notebookOnly]);

  const selectMode = (nextMode: AnswerMode) => {
    if (nextMode === "notebook") setNotebookVisited(true);
    setMode(nextMode);
  };

  const readImage = (file?: File) => {
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setImageError("Choose a PNG, JPEG, WebP, GIF, or other raster image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Choose an image smaller than 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onImageChange(reader.result);
      else setImageError("Could not read this image.");
    };
    reader.onerror = () => setImageError("Could not read this image.");
    reader.readAsDataURL(file);
  };

  const modes: Array<{ value: AnswerMode; label: string; Icon: typeof Type }> = [
    { value: "text", label: "Type", Icon: Type },
    { value: "notebook", label: "Handwrite", Icon: PenLine },
    { value: "image", label: "Upload", Icon: ImagePlus },
  ];

  return <section className="overflow-hidden rounded-md border border-border bg-surface/40" aria-label="Your answer">
    {!notebookOnly && <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/25 px-2 py-2" role="tablist" aria-label="How you want to work">
      <span className="mr-2 px-2 text-xs font-medium text-muted-foreground">Work your way</span>
      {modes.map(({ value, label, Icon }) => <button key={value} type="button" role="tab" aria-selected={mode === value} aria-label={value === "text" ? "Type your answer" : value === "notebook" ? "Handwrite in notebook" : "Upload an image"} title={label} disabled={(disabled && value !== "notebook") || (value === "notebook" && !notebookAttemptId)} onClick={() => selectMode(value)} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors", mode === value ? "border-primary/35 bg-background text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70", (disabled && value !== "notebook") || (value === "notebook" && !notebookAttemptId) ? "opacity-50" : "")}><Icon className="size-4" /><span>{label}</span></button>)}
    </div>}
    {mode === "text" && <div className="p-3">
      <Textarea aria-label="Your typed answer" value={text} onChange={(event) => onTextChange(event.target.value)} disabled={disabled} rows={5} placeholder={placeholder} className="bg-background" />
      <p className="mt-2 text-xs text-muted-foreground">{captureResponse ? "Your work stays on this device and is saved with your attempt." : "Response saving is turned off in settings, so this text will not be saved with your attempt."}</p>
    </div>}
    {notebookVisited && notebookAttemptId && <div hidden={mode !== "notebook"} className={notebookOnly ? "" : "p-3"}><DrawingNotebook questionId={questionId} attemptId={notebookAttemptId} onChange={onNotebookChange} /></div>}
    {mode === "image" && <div className="space-y-3 p-3">
      {image ? <div className="relative inline-block max-w-full">
        <img src={image} alt="Your uploaded answer" className="max-h-96 max-w-full rounded border border-border object-contain" />
        <button type="button" aria-label="Remove uploaded image" disabled={disabled} onClick={() => { onImageChange(""); setImageError(null); }} className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow"><X className="size-4" /></button>
      </div> : <label className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-input text-sm text-muted-foreground hover:bg-muted/50", disabled && "pointer-events-none opacity-50")}>
        <ImagePlus className="size-6" />
        <span>Choose an image of your answer</span>
        <input type="file" accept="image/*" disabled={disabled} className="sr-only" onChange={(event) => readImage(event.target.files?.[0])} />
      </label>}
      {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
      <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, GIF, or another image format, up to 10 MB. {captureResponse ? "Saved with your attempt on this device." : "Response saving is turned off in settings."}</p>
    </div>}
  </section>;
}
