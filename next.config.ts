import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use the project directory explicitly. The parent C:\\Users\\hubin
  // contains an unrelated package-lock.json, which makes Turbopack infer
  // the wrong workspace and prevents it from resolving local dependencies.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
