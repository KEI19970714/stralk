import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: [
    "https://localhost:3000",
    "https://127.0.0.1:3000",
    "https://192.168.11.4:3000",
  ],
  devIndicators: false,
};

export default nextConfig;
