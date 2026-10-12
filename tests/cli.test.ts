import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const cli = (...args: string[]) => execFileSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
describe('CLI', () => {
  it('supports help, version, inline input and JSON/HTML/plain formats', () => {
    expect(cli('--help')).toContain('Usage: textheat');
    expect(cli('--version').trim()).toBe('0.1.0');
    expect(JSON.parse(cli('analyze', 'fantastic', '--format', 'json')).sentiment.label).toBe('positive');
    expect(cli('I love <b>this</b>', '--format', 'html')).toContain('&lt;b&gt;');
    expect(cli('fantastic', '--format', 'plain')).toBe('fantastic\n');
    expect(cli('fantastic', '--no-color')).not.toContain('\x1b');
    expect(cli('--', '--literal')).toBe('--literal\n');
  });
  it('colors TTY output, respects NO_COLOR, and strips input controls', () => {
    const run = (env: NodeJS.ProcessEnv = {}) => execFileSync(process.execPath, ['--input-type=module', '-e',
      `Object.defineProperty(process.stdout, 'isTTY', {value:true}); process.argv=['node','cli','I love this but it is awful']; await import('./dist/cli.js');`
    ], { encoding: 'utf8', env: { ...process.env, NO_COLOR: undefined, ...env } });
    expect(run()).toContain('\x1b[32m'); expect(run()).toContain('\x1b[31m');
    expect(run({ NO_COLOR: '1' })).not.toContain('\x1b');
    expect(cli('good\x1b[2J', '--no-color')).not.toContain('\x1b');
    expect(JSON.parse(cli('I love it and feel angry', '--emotions', 'joy, anger', '--format', 'json')).highlights).toHaveLength(2);
  });
  it('supports threshold, emotion filtering and UTF-8 file/stdin input', () => {
    expect(JSON.parse(cli('good', '--threshold', '0.9', '--format', 'json')).highlights).toEqual([]);
    expect(JSON.parse(cli('I love this but it is awful', '--emotions', 'joy', '--format', 'json')).highlights).toHaveLength(1);
    const dir = mkdtempSync(join(tmpdir(), 'textheat-test-'));
    try {
      const file = join(dir, 'review.txt'); writeFileSync(file, '🧡 wonderful', 'utf8');
      expect(JSON.parse(cli('analyze', '--file', file, '--format', 'json')).text).toBe('🧡 wonderful');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const stdin = spawnSync(process.execPath, ['dist/cli.js', '--file', '-', '--format', 'json'], { input: 'not good', encoding: 'utf8' });
    expect(JSON.parse(stdin.stdout).sentiment.label).toBe('negative');
  });
  it.each([['--unknown'], ['--file'], ['--file', 'missing-file'], ['x', '--threshold', '2'], ['x', '--threshold', 'oops'], ['x', '--format', 'yaml'], ['x', '--emotions', 'invalid'], ['x', '--file', '-']])('reports errors for %s', (...args) => {
    const result = spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
    expect(result.status).toBe(1); expect(result.stderr).toContain('textheat:');
  });
});