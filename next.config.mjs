import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 🔥 렌더/브라우저 캐시 완전 차단
  generateEtags: false,
  poweredByHeader: false,
  experimental: {
    optimizeCss: false,
  },

  // 🔥 모든 페이지 캐시 금지 — 항상 최신 빌드 로드
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },

  // 🔥 turbopack 경고 제거용 (문제 없게 유지)
  turbopack: {},

  // 🔥 '@' 경로 alias 유지
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(import.meta.dirname);
    return config;
  },
};

export default nextConfig;





