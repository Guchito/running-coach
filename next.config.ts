import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't pick the parent folder's lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
  // The "N" badge sits bottom-left — exactly on the mobile Home tab, where it
  // swallows taps. Compile/runtime errors still surface without it.
  devIndicators: false,
};

export default nextConfig;
