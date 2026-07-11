"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type FileInputProps = {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  maxSizeMb?: number;
  error?: string;
  className?: string;
};

function matchesAccept(file: File, accept: string): boolean {
  const patterns = accept
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => {
    if (pattern.startsWith(".")) return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    if (pattern.endsWith("/*")) return file.type.startsWith(pattern.slice(0, -1));
    return file.type === pattern;
  });
}

export function FileInput({
  onFiles,
  accept,
  multiple,
  disabled,
  label = "Arrastra un archivo o haz clic para elegirlo",
  hint,
  maxSizeMb,
  error,
  className,
}: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const errorId = useId();

  function validate(files: FileList): boolean {
    for (const file of Array.from(files)) {
      if (accept && !matchesAccept(file, accept)) {
        setLocalError(`"${file.name}" no tiene un formato válido (${accept}).`);
        return false;
      }
      if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
        setLocalError(`"${file.name}" supera el tamaño máximo de ${maxSizeMb} MB.`);
        return false;
      }
    }
    setLocalError(null);
    return true;
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!validate(files)) return;
    setFileNames(Array.from(files).map((f) => f.name));
    onFiles(files);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }

  const displayError = error ?? localError;

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-invalid={Boolean(displayError)}
        aria-describedby={displayError ? errorId : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          dragOver ? "border-ca-violet bg-ca-violet/5" : "border-ca-ink/[0.14] bg-ca-surface",
          displayError && "border-destructive",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-label={label}
          tabIndex={-1}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="sr-only"
        />
        <UploadCloud className="h-6 w-6 text-ca-ink-soft" />
        <p className="text-sm font-semibold text-ca-ink">
          {dragOver ? "Suelta el archivo aquí" : fileNames.length > 0 ? fileNames.join(", ") : label}
        </p>
        {hint && !displayError && <p className="text-[12px] text-ca-ink-soft">{hint}</p>}
      </div>
      {displayError && (
        <p id={errorId} className="mt-1 text-[12px] font-semibold text-destructive">
          {displayError}
        </p>
      )}
    </div>
  );
}
