import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // The app lives at the root of its own domain (routecam.app). Set BASE_PATH (e.g. "/routecam")
  // only when it has to run in a sub-folder of another site.
  basePath: process.env.BASE_PATH || '',
  env: { NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || '' },
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
