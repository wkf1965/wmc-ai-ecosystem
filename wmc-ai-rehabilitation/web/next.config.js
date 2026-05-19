/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@wmc/shared-ui"],
}

module.exports = nextConfig