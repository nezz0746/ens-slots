import type { NextConfig } from "next";

/**
 * `wagmi/connectors` is a barrel.
 *
 * Importing `mock` and `injected` from it also pulls in Coinbase's Base
 * Account connector, which reaches @base-org/account → @coinbase/cdp-sdk →
 * a family of optional `@x402/*` and Solana packages that are not installed.
 * They sit behind dynamic imports that never run for the two connectors this
 * app uses, but webpack resolves them anyway and the whole page 500s.
 *
 * Stubbed rather than installed: pulling in a Solana SDK to satisfy a code
 * path that cannot execute would be a strange thing to ship.
 */
const UNUSED_CONNECTOR_DEPS = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
  "@solana/kit",
];

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(UNUSED_CONNECTOR_DEPS.map((m) => [m, false])),
    };
    return config;
  },
};

export default nextConfig;
