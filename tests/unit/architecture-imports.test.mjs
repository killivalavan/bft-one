import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Architectural Integrity & Import Safety Test Suite
 *
 * Enforces production invariants:
 * 1. Zero runtime named imports from Next.js page.tsx files
 * 2. Strict Next.js App Router page export compliance (prevents .next/types build crashes)
 * 3. Verified named exports for critical shared utility modules
 */

function getAllSourceFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe("Architectural Import & Next.js Route Compliance", () => {
  const rootDir = process.cwd();
  const sourceFiles = [
    ...getAllSourceFiles(path.join(rootDir, "app")),
    ...getAllSourceFiles(path.join(rootDir, "components")),
    ...getAllSourceFiles(path.join(rootDir, "lib")),
  ];

  it("ensures zero runtime named imports originate from Next.js page files", () => {
    const violations = [];
    // Matches: import { X, Y } from ".../page" (excluding type-only imports: import type { ... })
    const runtimePageImportRegex = /import\s+(?!type\s*)\{[^}]+\}\s+from\s+["'][^"']*\/page(?:\.[a-z]+)?["']/g;

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      // Remove multiline and single-line comments before inspecting
      const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      const matches = cleaned.match(runtimePageImportRegex);
      if (matches) {
        violations.push({
          file: path.relative(rootDir, filePath),
          matches,
        });
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found forbidden runtime imports from page.tsx in ${violations.length} files:\n` +
        violations.map((v) => `  - ${v.file}: ${v.matches.join(", ")}`).join("\n")
    );
  });

  it("ensures all app/**/page.tsx files export only valid Next.js route symbols", () => {
    const pageFiles = sourceFiles.filter((f) => path.basename(f) === "page.tsx" && f.includes(path.join(rootDir, "app")));
    const allowedExportNames = new Set([
      "default",
      "dynamic",
      "dynamicParams",
      "revalidate",
      "fetchCache",
      "runtime",
      "preferredRegion",
      "maxDuration",
      "config",
      "generateStaticParams",
      "metadata",
      "generateMetadata",
      "viewport",
      "generateViewport",
      "unstable_prefetch",
    ]);

    const nonStandardExports = [];

    for (const pageFile of pageFiles) {
      const content = fs.readFileSync(pageFile, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;

        // Skip type-only exports: export type ..., export interface ...
        if (/^export\s+(?:type|interface)\s+/.test(line)) continue;

        // Check: export const/let/var/function/async function X
        const match = line.match(/^export\s+(?:async\s+)?(?:const|function|let|var)\s+([A-Za-z0-9_$]+)/);
        if (match) {
          const exportName = match[1];
          if (!allowedExportNames.has(exportName)) {
            nonStandardExports.push({
              file: path.relative(rootDir, pageFile),
              line: i + 1,
              exportName,
            });
          }
        }

        // Check: export { X, Y } (non-type re-exports)
        const reexportMatch = line.match(/^export\s+\{([^}]+)\}/);
        if (reexportMatch) {
          const names = reexportMatch[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());
          for (const name of names) {
            if (name && !name.startsWith("type ") && !allowedExportNames.has(name)) {
              nonStandardExports.push({
                file: path.relative(rootDir, pageFile),
                line: i + 1,
                exportName: name,
              });
            }
          }
        }
      }
    }

    assert.strictEqual(
      nonStandardExports.length,
      0,
      `Found illegal non-standard exports in page.tsx route files:\n` +
        nonStandardExports.map((e) => `  - ${e.file}:${e.line} exports '${e.exportName}'`).join("\n")
    );
  });

  it("verifies all named imports from bakerUtils resolve to actual exports", () => {
    const bakerUtilsPath = path.join(rootDir, "lib", "utils", "bakerUtils.ts");
    assert.ok(fs.existsSync(bakerUtilsPath), "lib/utils/bakerUtils.ts must exist");
    const bakerContent = fs.readFileSync(bakerUtilsPath, "utf8");

    // Extract all exported names from bakerUtils
    const exportedNames = new Set();
    const exportRegex = /export\s+(?:async\s+)?(?:const|function|let|var|interface|type)\s+([A-Za-z0-9_$]+)/g;
    let m;
    while ((m = exportRegex.exec(bakerContent)) !== null) {
      exportedNames.add(m[1]);
    }

    const missingImports = [];
    const importRegex = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'][^"']*bakerUtils["']/g;

    for (const filePath of sourceFiles) {
      if (filePath === bakerUtilsPath) continue;
      const content = fs.readFileSync(filePath, "utf8");
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const symbols = match[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim()).filter(Boolean);
        for (const sym of symbols) {
          if (!exportedNames.has(sym)) {
            missingImports.push({
              consumer: path.relative(rootDir, filePath),
              symbol: sym,
            });
          }
        }
      }
    }

    assert.strictEqual(
      missingImports.length,
      0,
      `Found consumers importing non-existent symbols from bakerUtils:\n` +
        missingImports.map((m) => `  - ${m.consumer} imports '${m.symbol}'`).join("\n")
    );
  });
});

