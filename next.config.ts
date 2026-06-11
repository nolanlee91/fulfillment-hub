import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse/pdfjs-dist dùng worker (pdf.worker.mjs) + tính năng Node — phải để
  // require native từ node_modules, không cho bundler nuốt (nếu không sẽ lỗi
  // "Cannot find module pdf.worker.mjs" khi sắp label PDF lúc chạy production).
  serverExternalPackages: ["ssh2", "ssh2-sftp-client", "pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
