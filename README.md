# Krai Products Image Optimizer

Converts JPG/JPEG images from `products` to WebP in `compressed` while keeping the same directory structure.

## Install

```bash
npm install
```

## Run

Default folders:

```bash
npm run optimize:images
```

By default, it uses `quality=95` (visually lossless) to reduce file size.

Custom folders:

```bash
node scripts/optimize-images.js --source products --output compressed --quality 95
```

Optional flags:

- `--force` overwrite existing `.webp` files
- `--quality <1-100>` set lossy WebP quality (default: `95`)
- `--lossless` use strict lossless WebP (can be larger than original JPG)
- `--help` show CLI help

## Result structure

Input:

```text
products/hikers/black/01.JPG
```

Output:

```text
compressed/hikers/black/01.webp
```

The script is restart-safe by default and skips already generated files unless `--force` is passed.
