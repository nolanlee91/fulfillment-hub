import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 dùng native bindings → để Node require trực tiếp, không qua Turbopack bundle
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
};

export default nextConfig;
