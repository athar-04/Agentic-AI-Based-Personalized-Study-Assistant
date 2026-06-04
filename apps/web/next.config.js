/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@agentic/shared"],
  output: "standalone",
  experimental: {
  },
  images: {
    domains: ["localhost", "res.cloudinary.com", "avatars.githubusercontent.com", "lh3.googleusercontent.com"],
  },
};

module.exports = nextConfig;
