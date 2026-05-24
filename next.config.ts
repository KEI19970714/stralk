import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // ← ここに追加
  allowedDevOrigins: ["https://localhost:3000", "https://127.0.0.1:3000"],
};

export default nextConfig;
