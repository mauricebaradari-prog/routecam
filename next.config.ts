import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/routecam',
  env: { NEXT_PUBLIC_BASE_PATH: '/routecam' },
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
