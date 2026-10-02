import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  agentRules: false, // Preserve the repository's own workflow instructions.
  webpack(config, { dev }) {
    if (dev) {
      const ignored = config.watchOptions?.ignored;
      // Webpack accepts a RegExp OR string globs, not a mixed array.
      config.watchOptions = { ...config.watchOptions, ignored: ignored instanceof RegExp
        ? new RegExp(`${ignored.source}|[/\\\\](?:source-photos|output|\\.playwright-cli|\\.wrangler)(?:[/\\\\]|$)`, ignored.flags)
        : [...(Array.isArray(ignored) ? ignored : ignored ? [ignored] : []),
          "**/source-photos/**", "**/output/**", "**/.playwright-cli/**", "**/.wrangler/**"] };
    }
    return config;
  },
};

export default nextConfig;
