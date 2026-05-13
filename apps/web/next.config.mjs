/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
