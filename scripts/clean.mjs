import { rmSync } from 'node:fs';

for (const dir of ['dist', 'out', 'dev-dist', 'coverage', 'playwright-report', 'test-results']) {
  rmSync(dir, { recursive: true, force: true });
}
console.log(
  'Limpieza completada: dist/, out/, dev-dist/, coverage/, playwright-report/, test-results/',
);
