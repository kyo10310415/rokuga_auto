/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Render環境での外部画像設定
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  // サーバーコンポーネントの外部パッケージ設定
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
}

module.exports = nextConfig
