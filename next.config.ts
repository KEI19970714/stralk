import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.11.4",
  ],
  devIndicators: false,
};

export default nextConfig;
