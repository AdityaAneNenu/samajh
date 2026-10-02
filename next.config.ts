import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The AI provider key is read from the server environment only. Nothing here
  // is exposed to the browser bundle.
  env: {},
};

export default nextConfig;