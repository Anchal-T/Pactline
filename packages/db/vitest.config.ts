import { defineConfig } from "vitest/config";

// Integration tests talk to Neon (us-east-2); each statement is a network round trip.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 180_000 } });
