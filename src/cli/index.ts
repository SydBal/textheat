#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { analyze, renderHTML } from '../api/index';
import type { Emotion, Options } from '../core/types';

const help = `textheat — local sentiment highlighting
Usage: textheat [analyze] [text] [options]
  --file PATH           Read a UTF-8 file (or - for stdin)
  --format FORMAT       json, html, plain, or terminal (default)
  --threshold NUMBER    Highlight importance cutoff, 0–1
  --emotions LIST       Comma-separated joy,anger,sadness,fear,surprise
  --no-color            Disable terminal ANSI colors
  --help                Show this help
  --version             Show version
  --                    Treat following arguments as text
Examples:
  textheat "I love this, but the service is terrible."
  textheat analyze --file review.txt --format json`;

export function main(args = process.argv.slice(2)): void {
  try {
    const words: string[] = [];
    const options: Options = {};
    let format = 'terminal', file: string | undefined, noColor = false;
    if (args[0] === 'analyze') args = args.slice(1);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const value = () => { const v = args[++i]; if (!v || v.startsWith('--')) throw new Error(`Missing value for ${arg}`); return v; };
      if (arg === '--help' || arg === '-h') { console.log(help); return; }
      if (arg === '--version' || arg === '-v') { console.log('0.1.0'); return; }
      if (arg === '--') { words.push(...args.slice(i + 1)); break; }
      if (arg === '--file') file = value();
      else if (arg === '--format') format = value();
      else if (arg === '--threshold') options.threshold = Number(value());
      else if (arg === '--emotions' || arg === '--emotion') options.emotions = value().split(',').map(e => e.trim()) as Emotion[];
      else if (arg === '--no-color') noColor = true;
      else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else words.push(arg);
    }
    if (!['json', 'html', 'plain', 'terminal'].includes(format)) throw new Error(`Unknown format: ${format}`);
    if (file !== undefined && words.length) throw new Error('Choose inline text or --file, not both');
    if (file === undefined && !words.length) { console.log(help); return; }
    const input = file !== undefined ? readFileSync(file === '-' ? 0 : file, 'utf8') : words.join(' ');
    const result = analyze(input, options);
    if (format === 'json') console.log(JSON.stringify(result, null, 2));
    else if (format === 'html') console.log(renderHTML(input, result, options));
    else if (format === 'plain' || noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY) console.log(input.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ''));
    else {
      let offset = 0;
      const chunks: string[] = [];
      for (const p of result.highlights) {
        chunks.push(input.slice(offset, p.start), `\u001b[${p.sentiment === 'positive' ? '32' : '31'}m`, input.slice(p.start, p.end), '\u001b[0m');
        offset = p.end;
      }
      chunks.push(input.slice(offset));
      // Strip user-provided terminal controls, including escape sequences.
      console.log(chunks.map((chunk, index) => index % 4 === 1 || index % 4 === 3 ? chunk : chunk.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')).join(''));
    }
  } catch (error) { console.error(`textheat: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
main();