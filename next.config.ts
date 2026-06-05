import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.aliyuncs.com",
      },
      {
        protocol: "https",
        hostname: "*.myqcloud.com",
      },
    ],
  },
};

export default nextConfig;
