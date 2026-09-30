#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const load = (name) => JSON.parse(readFileSync(join(root, 'public', 'indexes', name), 'utf8'));
const questions = load('questions-index.json');
const cases = load('cases-index.json');
const links = load('links-index.json');
const sources = [...questions, ...cases];
const hubs = ['citow', 'gh11'];
const rows = [];
for (const bookId of [...new Set(sources.map((row) => row.bookId))].sort()) {
  const bookSources = sources.filter((row) => row.bookId === bookId);
  const sourceIds = new Set(bookSources.map((row) => row.id));
  const output = { bookId, sourceRecords: bookSources.length };
  for (const hub of hubs) {
    const hubLinks = links.filter((link) => link.hub === hub && sourceIds.has(link.fromId));
    output[hub] = {
      linkedRecords: new Set(hubLinks.map((link) => link.fromId)).size,
      links: hubLinks.length,
      coverage: Number((new Set(hubLinks.map((link) => link.fromId)).size / Math.max(bookSources.length, 1)).toFixed(4)),
      highConfidence: hubLinks.filter((link) => link.confidence >= 0.8).length,
      hubTopicLinks: hubLinks.filter((link) => link.basis === 'reference-hub-topic').length
    };
  }
  rows.push(output);
}
const report = { generatedAt: new Date().toISOString(), hubs, totals: { sourceRecords: sources.length }, books: rows };
writeFileSync(join(root, 'library', 'reference-hub-coverage.json'), JSON.stringify(report, null, 2) + '\n');
const md = [
  '# Central reference hub coverage',
  '',
  'This report measures explicit semantic hub links from every indexed question/case book to the two central reference corpora.',
  '',
  '| Book | Records | Citow coverage | GH11 coverage | Citow links | GH11 links |',
  '|---|---:|---:|---:|---:|---:|',
  ...rows.map((row) => `| ${row.bookId} | ${row.sourceRecords} | ${(row.citow.coverage * 100).toFixed(1)}% | ${(row.gh11.coverage * 100).toFixed(1)}% | ${row.citow.links} | ${row.gh11.links} |`),
  '',
  'Links are navigation suggestions. They are not answer-level citations unless separately verified.'
].join('\n') + '\n';
writeFileSync(join(root, 'library', 'REFERENCE_HUB_COVERAGE.md'), md);
console.log(`reference-hubs: ${rows.length} source books audited`);
