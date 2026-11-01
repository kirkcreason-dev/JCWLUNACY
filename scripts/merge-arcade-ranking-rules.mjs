// Activation helper: merge the tested namespace into a freshly downloaded copy
// of the LIVE rules. Never deploy arcade-rankings.rules.json by itself: doing so
// would remove the site's unrelated permissions. This script does not deploy.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function mergeRules(live, fragment) {
  if (!live?.rules || typeof live.rules !== 'object' || Array.isArray(live.rules)) throw new Error('Expected the current live rules document.');
  if (!fragment?.rules?.arcadeRankings || Object.keys(fragment.rules).length !== 1) throw new Error('Expected only the arcadeRankings namespace.');
  for (const access of ['.read', '.write']) {
    if (live.rules[access] !== undefined && live.rules[access] !== false && live.rules[access] !== 'false') throw new Error('Live root-level access must be reviewed before adding rankings; parent grants bypass child restrictions.');
  }
  if (live.rules.arcadeRankings && JSON.stringify(live.rules.arcadeRankings) !== JSON.stringify(fragment.rules.arcadeRankings)) throw new Error('The live rankings namespace already differs. Review it instead of overwriting it.');
  return { ...live, rules: { ...live.rules, arcadeRankings: structuredClone(fragment.rules.arcadeRankings) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/merge-arcade-ranking-rules.mjs LIVE-RULES.json NEW-MERGED-RULES.json');
  const merged = mergeRules(JSON.parse(readFileSync(input, 'utf8')), JSON.parse(readFileSync(new URL('../arcade-rankings.rules.json', import.meta.url), 'utf8')));
  writeFileSync(output, JSON.stringify(merged, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write('Prepared rules with only arcadeRankings added. Review the diff before publishing through an authenticated Firebase session.\n');
}
