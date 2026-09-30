#!/usr/bin/env node
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, linkSync, copyFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const fullDir = join(root, "dist");
const coreDir = join(root, "dist-core");
const mediaDir = join(root, "dist-media");
if (!existsSync(fullDir)) throw new Error("Missing dist/. Run npm run build first.");
rmSync(coreDir, { recursive: true, force: true });
rmSync(mediaDir, { recursive: true, force: true });
cpSync(fullDir, coreDir, { recursive: true });

const isMedia = (name) => /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)$/i.test(name);
function walk(dir) {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}
function removeCoreMedia(dir) {
  for (const path of walk(dir)) {
    if (isMedia(path) || /(?:^|\/)pack-\d+\.json$/i.test(path)) rmSync(path, { force: true });
  }
  for (const path of walk(dir).filter((p) => lstatSync(p).isDirectory()).sort((a, b) => b.length - a.length)) {
    try { if (!readdirSync(path).length) rmSync(path, { recursive: true, force: true }); } catch {}
  }
}
function hardlinkOrCopy(source, target) {
  mkdirSync(resolve(target, ".."), { recursive: true });
  try { linkSync(source, target); } catch { copyFileSync(source, target); }
}
removeCoreMedia(join(coreDir, "library"));
const fullLibrary = join(fullDir, "library");
for (const path of walk(fullLibrary)) {
  const rel = relative(fullDir, path);
  if (!isMedia(path)) continue;
  const target = join(mediaDir, rel);
  hardlinkOrCopy(path, target);
}
mkdirSync(join(mediaDir, "library"), { recursive: true });
writeFileSync(join(mediaDir, "README.md"), "# NeuroQuiz standalone media overlay\n\nCopy the contents of this directory over a matching `dist-core/` build. The overlay restores local book media without changing JSON, indexes, user data, or the app shell.\n");
const fullIndex = JSON.parse(readFileSync(join(fullDir, "library", "index.json"), "utf8"));
const mediaFiles = walk(join(mediaDir, "library")).map((p) => relative(mediaDir, p).replaceAll("\\", "/"));
writeFileSync(join(mediaDir, "media-manifest.json"), JSON.stringify({ format: 1, generatedFrom: fullIndex.generatedAt, files: mediaFiles }, null, 2) + "\n");
console.log(`package-offline: full=${fullDir}`);
console.log(`package-offline: core=${coreDir} (${(walk(coreDir).length)} files)`);
console.log(`package-offline: media=${mediaDir} (${mediaFiles.length} files)`);
