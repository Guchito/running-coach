"use client";

import { useEffect, useRef, useState } from "react";
import type { ExerciseMedia as Media } from "@/lib/types";

// The exercise demo itself: video first, animated GIF when there's no video,
// static image last. The video plays as a silent, looping clip — motion showing
// mechanics — but under prefers-reduced-motion it holds on the poster frame and
// exposes controls so the athlete presses play themselves.
export function ExerciseMedia({
  media,
  className = "",
}: {
  media: Media;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    setMotionOk(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const box =
    "w-full rounded-xl overflow-hidden border border-border bg-black/3 " + className;
  const inner = "w-full h-auto max-h-[440px] object-contain mx-auto block";

  if (media.videoUrl) {
    return (
      <div className={box}>
        <video
          ref={videoRef}
          className={inner}
          src={media.videoUrl}
          poster={media.imageUrl ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          autoPlay={motionOk}
          controls={!motionOk}
          aria-label={media.matchedName ? `${media.matchedName} demonstration` : "Exercise demonstration"}
        />
      </div>
    );
  }

  const still = media.gifUrl ?? media.imageUrl;
  if (still) {
    return (
      <div className={box}>
        {/* GIFs animate on their own; a static image just sits. Both are plain
            <img> so the browser handles decoding and lazy loading. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={inner}
          src={still}
          alt={media.matchedName ? `${media.matchedName} demonstration` : "Exercise demonstration"}
          loading="lazy"
        />
      </div>
    );
  }

  return null;
}
