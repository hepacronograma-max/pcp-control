/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {},
  serverExternalPackages: ["@napi-rs/canvas"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@napi-rs/canvas": false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
