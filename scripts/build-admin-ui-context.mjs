#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const outputFile = path.join(projectRoot, 'admin-ui-context.txt');

const filesToInclude = [
  {
    label: 'Main Admin view',
    candidates: ['app/stock/admin/page.js'],
  },
  {
    label: 'Navigation and global wrapper',
    candidates: ['app/stock/layout.js'],
  },
  {
    label: 'Admin dashboard API data structure',
    candidates: ['app/api/stock/admin/dashboard/route.js'],
  },
  {
    label: 'Tailwind theme and palette',
    candidates: ['tailwind.config.js'],
  },
  {
    label: 'Base styles',
    candidates: ['app/globals.css', 'styles/globals.css'],
  },
];

async function findExistingFile(candidates) {
  for (const relativePath of candidates) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
      await fs.access(absolutePath);
      return relativePath;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function readSection(relativePath, label) {
  const absolutePath = path.join(projectRoot, relativePath);
  const content = await fs.readFile(absolutePath, 'utf8');

  return [
    `=== ${label} ===`,
    `File: ${relativePath}`,
    '',
    content.trimEnd(),
    '',
  ].join('\n');
}

async function main() {
  const sections = [];
  const missing = [];

  for (const entry of filesToInclude) {
    const existingFile = await findExistingFile(entry.candidates);

    if (!existingFile) {
      missing.push(entry.candidates[0]);
      continue;
    }

    const section = await readSection(existingFile, entry.label);
    sections.push(section);
  }

  const header = [
    'Admin UI Context Bundle',
    `Generated: ${new Date().toISOString()}`,
    '',
  ].join('\n');

  const missingBlock = missing.length
    ? [
        '=== Missing Files ===',
        ...missing.map((file) => `- ${file}`),
        '',
      ].join('\n')
    : '';

  const output = [header, missingBlock, ...sections].filter(Boolean).join('\n');
  await fs.writeFile(outputFile, output, 'utf8');

  console.log(`Created ${path.relative(projectRoot, outputFile)} with ${sections.length} section(s).`);
  if (missing.length) {
    console.warn(`Missing ${missing.length} file(s): ${missing.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Failed to build admin-ui-context.txt');
  console.error(error);
  process.exitCode = 1;
});