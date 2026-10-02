import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the container image can run without
  // node_modules. See Dockerfile.
  output: "standalone",
  // Nothing else is configured here on purpose. The AI provider credential is
  // read from the server environment inside the route handler and never reaches
  // the browser bundle; adding it to `env` below would inline it into client
  // code.
};

export default nextConfig;