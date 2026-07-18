import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const entryPoint = "./src/features/presenter/runtime.ts";
const cssSource = resolve(
  projectRoot,
  "src",
  "features",
  "presenter",
  "presenter-runtime.css",
);
const outputDirectory = resolve(
  projectRoot,
  "public",
  "builder-v2-assets",
);
const scriptOutput = resolve(outputDirectory, "presenter-runtime.js");
const cssOutput = resolve(outputDirectory, "presenter-runtime.css");

let esbuild;
try {
  ({ build: esbuild } = await import("esbuild"));
} catch {
  console.error(
    'Presenter runtime build requires the dev dependency "esbuild". Run "npm install --save-dev esbuild" first.',
  );
  process.exitCode = 1;
}

if (esbuild) {
  await mkdir(dirname(scriptOutput), { recursive: true });
  await esbuild({
    entryPoints: [entryPoint],
    absWorkingDir: projectRoot,
    outfile: scriptOutput,
    bundle: true,
    format: "iife",
    globalName: "LessonPresenterRuntime",
    platform: "browser",
    target: ["es2017"],
    minify: true,
    legalComments: "none",
    sourcemap: false,
    charset: "utf8",
  });
  await copyFile(cssSource, cssOutput);
  console.log(
    `Built presenter runtime assets:\n- ${scriptOutput}\n- ${cssOutput}`,
  );
}
