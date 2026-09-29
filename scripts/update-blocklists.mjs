/**
 * SFWbrowse - Remote Blocklist Compilation Script
 *
 * Fetches trusted open-source adult domain blocklists, normalizes hostnames,
 * deduplicates entries, and compiles them into core/rules/blocklist.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blocklistJsonPath = resolve(monorepoRoot, "core/rules/blocklist.json");

const SOURCES = [
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts",
];

const DOMAIN_REGEX = /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/;

export async function fetchAndCompileBlocklists() {
  console.log("Fetching and compiling remote adult blocklists...");
  const domains = new Set();

  // Seed with current blocklist entries as fallback base
  try {
    const existingContent = await readFile(blocklistJsonPath, "utf8");
    const existingData = JSON.parse(existingContent);
    if (Array.isArray(existingData.domains)) {
      for (const d of existingData.domains) domains.add(d.toLowerCase());
    }
  } catch {
    // No previous file, start fresh
  }

  for (const url of SOURCES) {
    try {
      console.log(`Fetching ${url}...`);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.warn(`Failed to fetch ${url} (status: ${res.status})`);
        continue;
      }
      const text = await res.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const parts = trimmed.split(/\s+/);
        const host = parts.length >= 2 ? parts[1].toLowerCase() : parts[0].toLowerCase();
        if (host !== "0.0.0.0" && host !== "127.0.0.1" && DOMAIN_REGEX.test(host)) {
          domains.add(host);
        }
      }
    } catch (err) {
      console.warn(`Could not reach ${url}:`, err.message);
    }
  }

  const payload = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    categories: ["adult", "explicit"],
    domains: Array.from(domains).sort(),
  };

  await writeFile(blocklistJsonPath, JSON.stringify(payload, null, 2));
  console.log(`✓ Successfully compiled ${domains.size} blocked domains to ${blocklistJsonPath}`);
}

// Execute directly if run via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAndCompileBlocklists().catch((err) => {
    console.error("Blocklist compilation failed:", err);
    process.exit(1);
  });
}
