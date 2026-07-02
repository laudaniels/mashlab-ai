import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this app so an unrelated lockfile in the home
  // directory doesn't get picked up as the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
