import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyTrackedWorkspace } from '../../../scripts/fresh-start-verify.mjs';

describe('fresh start workspace copy', () => {
  it('copies tracked source but never local secrets or untracked files', () => {
    const root = mkdtempSync(join(tmpdir(), 'hallazia-fresh-files-'));
    const source = join(root, 'source');
    const destination = join(root, 'destination');
    try {
      mkdirSync(join(source, 'src'), { recursive: true });
      mkdirSync(join(source, 'data'), { recursive: true });
      writeFileSync(join(source, 'src', 'entry.js'), 'export const ready = true;');
      writeFileSync(join(source, 'data', '.gitkeep'), '');
      writeFileSync(join(source, '.env.example'), 'API_KEY=example');
      writeFileSync(join(source, '.env'), 'API_KEY=synthetic-secret');
      writeFileSync(join(source, 'untracked.txt'), 'local-only');
      execFileSync('git', ['init', '-q', source]);
      execFileSync('git', ['-C', source, 'add', 'src/entry.js', 'data/.gitkeep', '.env.example', '.env']);
      copyTrackedWorkspace(source, destination);
      expect(existsSync(join(destination, 'src', 'entry.js'))).toBe(true);
      expect(existsSync(join(destination, '.env.example'))).toBe(true);
      expect(existsSync(join(destination, '.env'))).toBe(false);
      expect(existsSync(join(destination, 'data'))).toBe(false);
      expect(existsSync(join(destination, 'untracked.txt'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
