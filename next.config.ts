import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "export" 제거 - API Route 사용을 위해 필요
  // API Route는 서버 측에서만 동작하므로 정적 내보내기와 호환되지 않음
};

export default nextConfig;
