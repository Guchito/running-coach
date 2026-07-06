"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";

const cardCls = "bg-card border border-border rounded-2xl";

export function UploadForm() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (name.trim()) fd.append("name", name.trim());
      const res = await fetch("/api/sessions", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      if (data.kind === "bulk") {
        // Garmin activities.csv — many runs at once.
        if (data.imported === 0) {
          setNotice(
            data.duplicates > 0
              ? `Nothing new to import: all ${data.duplicates} run${data.duplicates === 1 ? "" : "s"} in the file were already here.`
              : "No runs found in that file."
          );
          setBusy(false);
          setFile(null);
          return;
        }
        if (data.imported === 1 && data.lastId) {
          router.push(`/runs/${data.lastId}?new=1`);
          return;
        }
        router.push("/runs");
        return;
      }
      // Detected as a run or a gym session — go straight to its breakdown.
      // A duplicate upload lands on the run it matched, without the
      // "new run" review banner.
      router.push(
        data.kind === "gym" ? `/gym/${data.id}` : `/runs/${data.id}${data.duplicate ? "" : "?new=1"}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setBusy(false);
    }
  }

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    if (!/\.(csv|fit|tcx)$/i.test(f.name)) {
      setError("Please choose a .csv, .fit or .tcx file exported from your watch.");
      return;
    }
    setFile(f);
  }

  return (
    <div className="space-y-4">
      <div
        className={`${cardCls} p-10 border-2 border-dashed text-center cursor-pointer transition-[border-color,background-color,transform] duration-200 ease-out ${
          dragging ? "border-accent bg-accent-soft scale-[1.01]" : "border-border"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-accent-soft text-accent mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>
          {file ? (
            <div className="font-medium">{file.name}</div>
          ) : (
            <>
              <div className="font-medium">Drop your session file here</div>
              <div className="text-sm text-muted mt-1">or click to browse · <strong>.csv</strong>, <strong>.fit</strong> or <strong>.tcx</strong>. Runs and gym sessions are detected automatically, and Garmin&apos;s bulk <strong>activities.csv</strong> export imports every run at once.</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.fit,.tcx,text/csv,application/octet-stream"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {file && (
        <Card className="p-4 space-y-3 animate-in">
          <label className="block text-sm">
            <span className="text-muted">Name this session (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tuesday tempo, Long run, Leg day…"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <Button onClick={() => upload(file)} disabled={busy}>
              {busy ? "Analyzing…" : "Upload & analyze"}
            </Button>
            <Button variant="ghost" onClick={() => setFile(null)} disabled={busy}>
              Choose another
            </Button>
          </div>
        </Card>
      )}

      {notice && (
        <div className="animate-in text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      {error && (
        <div className="animate-in text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
    </div>
  );
}
