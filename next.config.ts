import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium"],
  async redirects() {
    return [
      { source: "/builder/index.html", destination: "/builder", permanent: false },
      { source: "/lessons/:path*", destination: "/builder", permanent: false },
    ];
  },
  outputFileTracingIncludes: {
    "/api/presenter/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
