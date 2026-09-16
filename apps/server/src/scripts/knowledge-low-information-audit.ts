import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { youtubeCommentRejection } from "../services/youtube-evidence-quality.js";

type AudienceCandidate = { readonly projectId: string; readonly text: string };

const source = new DatabaseSync(resolve(process.cwd(), "..", "..", "data", "our-platform.db"), { readOnly: true });
const rows = source.prepare(`
  SELECT e.project_id projectId,e.quote_text text
  FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id JOIN sources s ON s.id=e.source_id
  WHERE s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')
  UNION ALL
  SELECT c.project_id projectId,c.text text
  FROM comments c JOIN sources s ON s.id=c.source_id
  WHERE s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')
    AND NOT EXISTS(SELECT 1 FROM evidence_snippets e WHERE e.comment_id=c.id)
`).all() as AudienceCandidate[];

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

function unique(values: readonly AudienceCandidate[]): AudienceCandidate[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify([value.projectId, normalize(value.text)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Mirrors the bounded audit heuristic used by KnowledgeIndexBuilder. */
function nearDuplicatePairs(values: readonly AudienceCandidate[]): number {
  const buckets = new Map<string, Set<string>[]>();
  let count = 0;
  for (const value of values) {
    const words = new Set(normalize(value.text).toLowerCase().split(/\W+/).filter((word) => word.length > 4));
    const key = [...words].sort().slice(0, 6).join("|");
    const candidates = buckets.get(key) ?? [];
    for (const other of candidates) {
      const shared = [...words].filter((word) => other.has(word)).length;
      const union = new Set([...words, ...other]).size;
      if (union > 0 && shared / union >= 0.9) count++;
    }
    candidates.push(words);
    buckets.set(key, candidates);
  }
  return count;
}

const before = unique(rows);
const retained = rows.filter((row) => youtubeCommentRejection({ text: row.text }) === null);
const after = unique(retained);
console.log(JSON.stringify({
  scope: "eligible audience evidence/comments; artifacts are unchanged by this filter",
  audienceCandidates: rows.length,
  qualityRejected: rows.length - retained.length,
  uniqueBefore: before.length,
  uniqueAfter: after.length,
  uniqueRemoved: before.length - after.length,
  nearDuplicatePairsBefore: nearDuplicatePairs(before),
  nearDuplicatePairsAfter: nearDuplicatePairs(after),
  nearDuplicatePairsRemoved: nearDuplicatePairs(before) - nearDuplicatePairs(after),
}, null, 2));
source.close();
