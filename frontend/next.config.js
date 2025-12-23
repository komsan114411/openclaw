/** @type {import('next').NextConfig} */
/**
 * This repo supports 2 deployment modes:
 * - default (standalone): Next.js server runtime (docker-compose / `next start`)
 * - export: static export for single-container setups (served by backend as static files)
 *
 * Select via env:
 *   NEXT_OUTPUT=standalone  (default)
 *   NEXT_OUTPUT=export
 */
const isExport = process.env.NEXT_OUTPUT === 'export';

const nextConfig = {
  reactStrictMode: true,

  // Next build output mode
  output: isExport ? 'export' : 'standalone',

  // trailingSlash is typically desired for static export but can create routing edge cases on server mode
  trailingSlash: isExport,

  images: {
    // static export requires unoptimized, server mode can still use unoptimized safely
    unoptimized: true,
  },

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },

  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
