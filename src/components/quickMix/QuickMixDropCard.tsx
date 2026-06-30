import { Mic2, Music2, UploadCloud, X } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";

interface QuickMixDropCardProps {
  kind: "vocal" | "instrumental";
  title: string;
  hint: string;
  fileName: string | null;
  error: string | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
}

export function QuickMixDropCard({
  kind,
  title,
  hint,
  fileName,
  error,
  onFileSelected,
  onClear,
}: QuickMixDropCardProps) {
  const Icon = kind === "vocal" ? Mic2 : Music2;

  function acceptFile(file: File | undefined) {
    if (!file) {
      return;
    }
    onFileSelected(file);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    acceptFile(event.dataTransfer.files?.[0]);
  }

  return (
    <label
      className={`quick-mix-drop-card ${fileName ? "has-file" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        accept="audio/*,.wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg"
        className="quick-mix-drop-input"
        onChange={handleInputChange}
        type="file"
      />
      <div className="quick-mix-drop-icon">
        <Icon aria-hidden="true" size={28} />
      </div>
      <div className="quick-mix-drop-copy">
        <strong>{title}</strong>
        <p>{hint}</p>
        {fileName ? (
          <span className="quick-mix-file-name">{fileName}</span>
        ) : (
          <span className="quick-mix-drop-cta">
            <UploadCloud aria-hidden="true" size={16} />
            Drop or browse
          </span>
        )}
      </div>
      {fileName ? (
        <button
          className="quick-mix-clear-file"
          onClick={(event) => {
            event.preventDefault();
            onClear();
          }}
          type="button"
        >
          <X aria-hidden="true" size={16} />
          Remove
        </button>
      ) : null}
      {error ? <p className="quick-mix-drop-error">{error}</p> : null}
    </label>
  );
}
