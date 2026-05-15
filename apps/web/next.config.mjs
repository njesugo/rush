/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Type checking is performed in IDE / typecheck script; skip during prod build
  // to avoid React 19 RC vs @types/react peer-dep duplication issues in pnpm.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Disable gzip on Next responses so SSE chunks (text/event-stream) are flushed
  // immediately instead of buffered until the gzip window fills.
  compress: false,
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@rush/db", "@rush/shared", "@rush/services"],
  serverExternalPackages: [
    "@resvg/resvg-js",
    "satori",
    "better-sqlite3",
    "bullmq",
    "ioredis",
    "postgres",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
