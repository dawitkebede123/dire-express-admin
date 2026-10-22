import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["187.124.55.8"],
  serverExternalPackages: ["firebase-admin", "pg"],
};

export default nextConfig;
