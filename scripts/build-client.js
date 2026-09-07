import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "public", "app.js")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(root, "public", "app.bundle.js"),
});
