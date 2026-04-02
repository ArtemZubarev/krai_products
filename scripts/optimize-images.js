#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const DEFAULT_SOURCE = "products";
const DEFAULT_OUTPUT = "compressed";
const DEFAULT_QUALITY = 95;

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    force: false,
    lossless: false,
    quality: DEFAULT_QUALITY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if ((arg === "--source" || arg === "-s") && argv[index + 1]) {
      options.source = argv[index + 1];
      index += 1;
      continue;
    }

    if ((arg === "--output" || arg === "-o") && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--force" || arg === "-f") {
      options.force = true;
      continue;
    }

    if (arg === "--lossless") {
      options.lossless = true;
      continue;
    }

    if (arg === "--quality" || arg === "-q") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 1 || value > 100) {
        throw new Error("Quality must be a number in range 1..100");
      }
      options.quality = Math.round(value);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/optimize-images.js [options]

Options:
  -s, --source <dir>   Source directory with JPG/JPEG files (default: products)
  -o, --output <dir>   Output root directory for WebP files (default: compressed)
  -q, --quality <1-100> WebP quality for lossy mode (default: 95)
      --lossless        Use strict lossless WebP (can be larger than JPG)
  -f, --force          Overwrite existing WebP files
  -h, --help           Show this help message
`);
}

function isJpegFile(fileName) {
  return /\.(jpe?g)$/i.test(fileName);
}

async function collectJpegFiles(directory) {
  const result = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectJpegFiles(absolutePath);
      result.push(...nested);
      continue;
    }

    if (entry.isFile() && isJpegFile(entry.name)) {
      result.push(absolutePath);
    }
  }

  return result;
}

function mapOutputPath(sourceRoot, outputRoot, sourceFile) {
  const relativeToSource = path.relative(sourceRoot, sourceFile);
  const parsed = path.parse(relativeToSource);
  return path.join(outputRoot, parsed.dir, `${parsed.name}.webp`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function convertJpegToWebp(sourcePath, outputPath, options) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const webpOptions = options.lossless
    ? { lossless: true, effort: 6 }
    : { quality: options.quality, effort: 6 };
  await sharp(sourcePath).webp(webpOptions).toFile(outputPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sourceRoot = path.resolve(process.cwd(), options.source);
  const outputRoot = path.resolve(process.cwd(), options.output);

  const sourceExists = await exists(sourceRoot);
  if (!sourceExists) {
    throw new Error(`Source directory does not exist: ${sourceRoot}`);
  }

  const stats = {
    found: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
  };

  const files = await collectJpegFiles(sourceRoot);
  stats.found = files.length;

  console.log(`Found ${stats.found} JPG/JPEG files in ${sourceRoot}`);
  console.log(`Output directory: ${outputRoot}`);
  console.log(
    options.lossless
      ? "Mode: strict lossless WebP"
      : `Mode: quality=${options.quality} (visually lossless)`
  );

  for (const sourceFile of files) {
    const outputFile = mapOutputPath(sourceRoot, outputRoot, sourceFile);

    if (!options.force && (await exists(outputFile))) {
      stats.skipped += 1;
      console.log(`SKIP ${path.relative(process.cwd(), outputFile)}`);
      continue;
    }

    try {
      await convertJpegToWebp(sourceFile, outputFile, options);
      stats.converted += 1;
      console.log(`OK   ${path.relative(process.cwd(), outputFile)}`);
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${path.relative(process.cwd(), sourceFile)} -> ${message}`);
    }
  }

  console.log("");
  console.log("Done.");
  console.log(`Found:     ${stats.found}`);
  console.log(`Converted: ${stats.converted}`);
  console.log(`Skipped:   ${stats.skipped}`);
  console.log(`Failed:    ${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
