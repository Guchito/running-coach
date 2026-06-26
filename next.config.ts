import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't pick the parent folder's lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
