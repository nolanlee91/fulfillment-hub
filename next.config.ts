import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
};

export default nextConfig;
