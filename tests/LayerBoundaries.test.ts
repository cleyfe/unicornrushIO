import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Keeps the architecture honest:
//   engine-api  → nothing
//   engine-lib  → engine-api
//   engine      → engine-api, engine-lib
//   src/client  → any package, but the engine only at runtime through GameRunner
// and the engine packages stay deterministic and DOM-free.

const root = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

function imports(file: string): { spec: string; typeOnly: boolean }[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => ({
    spec: m[2],
    typeOnly: !!m[1],
  }));
}

const allowed: Record<string, string[]> = {
  'engine-api': [],
  'engine-lib': ['engine-api'],
  engine: ['engine-api', 'engine-lib'],
};

describe('layer boundaries', () => {
  for (const [pkg, deps] of Object.entries(allowed)) {
    it(`${pkg} imports only ${deps.join(', ') || 'itself'}`, () => {
      for (const f of files(join(root, 'packages', pkg, 'src'))) {
        for (const { spec } of imports(f)) {
          const m = spec.match(/^@unicornrush\/([^/]+)/);
          if (m) expect(deps, `${relative(root, f)} imports ${spec}`).toContain(m[1]);
          else expect(spec.startsWith('.'), `${relative(root, f)} imports ${spec}`).toBe(true);
        }
      }
    });

    it(`${pkg} stays deterministic and DOM-free`, () => {
      for (const f of files(join(root, 'packages', pkg, 'src'))) {
        const src = readFileSync(f, 'utf8');
        for (const banned of ['Math.random', 'Date.now', 'new Date', 'Math.exp', 'Math.pow', 'document.', 'window.']) {
          expect(src.includes(banned), `${relative(root, f)} uses ${banned}`).toBe(false);
        }
        expect(/[\w)\]]\s*\*\*\s*(?!2\b)/.test(src), `${relative(root, f)} uses ** with an exponent other than 2`).toBe(false);
      }
    });
  }

  it('client loads the engine at runtime only through GameRunner', () => {
    for (const f of files(join(root, 'src', 'client'))) {
      for (const { spec, typeOnly } of imports(f)) {
        if (spec.startsWith('@unicornrush/engine/') && !typeOnly) {
          expect(spec, relative(root, f)).toBe('@unicornrush/engine/GameRunner');
        }
      }
    }
  });
});
