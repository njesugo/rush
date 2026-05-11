/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
