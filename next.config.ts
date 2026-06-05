import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "images.unsplash.com" },
      { protocol: "https" as const, hostname: "*.cloudinary.com" },
      { protocol: "https" as const, hostname: "*.aliyuncs.com" },
      { protocol: "https" as const, hostname: "*.myqcloud.com" },
    ],
  },
};

export default nextConfig;
