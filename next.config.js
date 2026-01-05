/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',  // Google profile pictures
      },
      {
        protocol: 'https',
        hostname: 's.gravatar.com',             // Gravatar profile pictures
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com', // GitHub profile pictures
      },
      {
        protocol: 'https',
        hostname: 'platform-lookaside.fbsbx.com', // Facebook profile pictures
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
}

module.exports = nextConfig
