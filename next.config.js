const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  async redirects() {
    return [{ source: '/login', destination: '/login.html', permanent: false }];
  },
};

module.exports = withPWA(nextConfig);

