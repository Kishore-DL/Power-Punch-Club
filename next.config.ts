import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PPC_BUILD_DIR || '.next',
  // Keep the isolated regression build usable on local machines running Docker.
  ...(['.next-registration-tests','.next-content-preview'].includes(process.env.PPC_BUILD_DIR||'')?{experimental:{cpus:2}}:{}),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};

export default nextConfig;
