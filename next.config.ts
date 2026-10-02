import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Nothing is configured here on purpose. The AI provider credential is read
  // from the server environment inside the route handler and never reaches the
  // browser bundle; adding it to `env` below would inline it into client code.
};

export default nextConfig;