/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Render環境での外部画像設定
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  // サーバーコンポーネントの外部パッケージ設定（Next.js 15移行済み）
  serverExternalPackages: ['pino', 'pino-pretty'],
}

module.exports = nextConfig
