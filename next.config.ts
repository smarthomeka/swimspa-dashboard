import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@libsql/**", "./node_modules/libsql/**"],
  },
  turbopack: {
    resolveAlias: {
      // recharts 3.8 imports deep paths like es-toolkit/compat/get,
      // es-toolkit/compat/isPlainObject etc. but es-toolkit only
      // exports the barrel from es-toolkit/compat
      "es-toolkit/compat/*": "es-toolkit/compat",
    },
  },
};

export default nextConfig;
