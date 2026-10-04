import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static security audit executed with the unit tests. It fails the build if
 * a forbidden pattern sneaks into the sources: no eval-like constructs, no raw
 * HTML injection, no scripts or styles loaded from third-party origins, no
 * secrets, and the production CSP keeps its core directives.
 */
// Vitest runs from the project root.
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|html)$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = walk(join(ROOT, 'src')).filter(
  (f) => !f.includes(`${join('src', 'test', 'audit')}`),
);
const ALL_FILES = [
  ...SOURCE_FILES,
  join(ROOT, 'index.html'),
  join(ROOT, 'public', 'webtorrent-sw.js'),
  join(ROOT, 'vite.config.ts'),
];

const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: 'eval(', re: /\beval\s*\(/ },
  { name: 'new Function(', re: /new\s+Function\s*\(/ },
  { name: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ },
  { name: 'innerHTML / outerHTML assignment', re: /\.(inner|outer)HTML\s*=/ },
  { name: 'document.write', re: /document\.write\s*\(/ },
  { name: 'insertAdjacentHTML', re: /insertAdjacentHTML\s*\(/ },
  { name: 'setTimeout/setInterval with string', re: /set(Timeout|Interval)\s*\(\s*['"`]/ },
  { name: 'external script tag', re: /<script[^>]+src=["']https?:\/\// },
  { name: 'external stylesheet', re: /<link[^>]+href=["']https?:\/\/[^"']+\.css/ },
  { name: 'importScripts from another origin', re: /importScripts\(\s*['"]https?:\/\// },
  {
    name: 'analytics / tracking SDK',
    re: /(googletagmanager|google-analytics|gtag\(|segment\.com|mixpanel|hotjar|sentry\.io|plausible\.io)/i,
  },
  {
    name: 'hard-coded secret',
    re: /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i,
  },
];

describe('auditoría de seguridad estática', () => {
  it('no contiene construcciones prohibidas en el código fuente', () => {
    const findings: string[] = [];
    for (const file of ALL_FILES) {
      const text = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN) {
        if (rule.re.test(text)) findings.push(`${file.replace(ROOT, '')}: ${rule.name}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('la CSP de producción mantiene las directivas esenciales', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ]) {
      expect(vite).toContain(directive);
    }
    expect(vite).not.toMatch(/script-src[^"]*'unsafe-(inline|eval)'/);
  });

  it('index.html no carga recursos remotos y bloquea el referrer', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
  });

  it('todas las dependencias de producción tienen licencia libre compatible', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const allowed = new Set([
      'MIT',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      '0BSD',
      'MPL-2.0',
      'Unlicense',
    ]);
    for (const name of Object.keys(pkg.dependencies)) {
      const dep = JSON.parse(
        readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'),
      ) as { license?: string };
      expect(allowed.has(dep.license ?? ''), `${name}: ${dep.license}`).toBe(true);
    }
  });

  it('el Service Worker de streaming nunca usa la red ni la caché', () => {
    const sw = readFileSync(join(ROOT, 'public', 'webtorrent-sw.js'), 'utf8');
    expect(sw).not.toMatch(/\bfetch\s*\(\s*(event\.request|request|url)/);
    expect(sw).not.toMatch(/caches\./);
    expect(sw).not.toMatch(/self\.skipWaiting\s*\(/);
  });
});
