import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // The shebang in src/index.ts is preserved; make the output executable.
  banner: { js: "#!/usr/bin/env node" },
});
