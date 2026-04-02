#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const DEFAULT_SOURCE = "products";
const DEFAULT_OUTPUT = "compressed";
const DEFAULT_QUALITY = 95;
const DEFAULT_BASE_URL =
  "https://raw.githubusercontent.com/ArtemZubarev/krai_products/main/compressed";
const DEFAULT_LINKS_FILE = "compressed/links-by-model.txt";

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    force: false,
    lossless: false,
    quality: DEFAULT_QUALITY,
    baseUrl: DEFAULT_BASE_URL,
    linksFile: DEFAULT_LINKS_FILE,
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

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1].replace(/\/+$/, "");
      index += 1;
      continue;
    }

    if (arg === "--links-file" && argv[index + 1]) {
      options.linksFile = argv[index + 1];
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
      --base-url <url>  Base URL used to build links in report
      --links-file <p>  Path to text file with grouped links report
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

function getModelGroup(sourceRoot, sourceFile) {
  const relativeToSource = path.relative(sourceRoot, sourceFile);
  const [firstSegment] = relativeToSource.split(path.sep);
  return firstSegment || "root";
}

async function writeLinksReport(sourceRoot, files, options) {
  const reportByModel = new Map();
  const outputRoot = path.resolve(process.cwd(), options.output);
  const linksFilePath = path.resolve(process.cwd(), options.linksFile);

  for (const sourceFile of files) {
    const outputFile = mapOutputPath(sourceRoot, outputRoot, sourceFile);
    if (!(await exists(outputFile))) {
      continue;
    }

    const model = getModelGroup(sourceRoot, sourceFile);
    const relativeToOutput = path
      .relative(outputRoot, outputFile)
      .split(path.sep)
      .join("/");
    const link = `${options.baseUrl}/${relativeToOutput}`;

    if (!reportByModel.has(model)) {
      reportByModel.set(model, []);
    }
    reportByModel.get(model).push(link);
  }

  const models = Array.from(reportByModel.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  const lines = [];
  for (const model of models) {
    lines.push(`[${model}]`);
    const links = reportByModel.get(model).sort((a, b) => a.localeCompare(b));
    for (let index = 0; index < links.length; index += 1) {
      const link = links[index];
      const suffix = index === links.length - 1 ? "" : ",";
      lines.push(`${link}${suffix}`);
    }
    lines.push("");
  }

  await fs.mkdir(path.dirname(linksFilePath), { recursive: true });
  await fs.writeFile(linksFilePath, `${lines.join("\n").trim()}\n`, "utf8");
  return linksFilePath;
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
      : `Mode: quality=${options.quality} (visually lossless)`,
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
      console.error(
        `FAIL ${path.relative(process.cwd(), sourceFile)} -> ${message}`,
      );
    }
  }

  const linksReportPath = await writeLinksReport(sourceRoot, files, options);

  console.log("");
  console.log("Done.");
  console.log(`Found:     ${stats.found}`);
  console.log(`Converted: ${stats.converted}`);
  console.log(`Skipped:   ${stats.skipped}`);
  console.log(`Failed:    ${stats.failed}`);
  console.log(`Links:     ${path.relative(process.cwd(), linksReportPath)}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
