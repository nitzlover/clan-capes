/**
 * Scope-query regression test.  Run:  npm test   (tsx scripts/test-scope.ts)
 *
 * Guards the 2026-06-03 bug: serverQueryString() emitted `?server=` but
 * every /api/panel resolver reads `?serverId=`, so the param was a dead
 * key and the request silently fell back to the newest server. That sent
 * cape uploads to the wrong tenant ("clan not found on this server" even
 * though the picker showed the clan). No test runner needed — tsx is
 * already a dependency.
 */
import { serverQueryString } from '../src/lib/selected-server';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${JSON.stringify(actual)}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// The fix: key must be `serverId`, never the dead `server`.
check('number -> ?serverId=', serverQueryString(5), '?serverId=5');
check('all -> ?serverId=all', serverQueryString('all'), '?serverId=all');
check('null -> empty', serverQueryString(null), '');
check(
  'serverId key present',
  new URLSearchParams(serverQueryString(7).slice(1)).get('serverId'),
  '7',
);
check(
  'no dead `server=` key',
  new URLSearchParams(serverQueryString(7).slice(1)).has('server'),
  false,
);
check('extra params merge', serverQueryString(3, { limit: 10 }), '?serverId=3&limit=10');

if (failed > 0) {
  console.error(`\n${failed} scope-query check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll scope-query checks passed.');
