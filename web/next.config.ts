import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Electron app at the repository root has its own lockfile, which would
  // otherwise make Next.js infer the wrong workspace root.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
