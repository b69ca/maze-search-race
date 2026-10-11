#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createMaze, createSearch, step, analyze, render, renderSVG } from './index.js';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: maze-search-race [--seed N] [--width N] [--height N] [--delay MS] [--json] [--svg FILE] [--no-color]\nLive controls: p pause, n next seed, r restart, +/- speed, q quit'); process.exit(0); }
let restore = () => {};
try {
  const options = {}, flags = new Set(['--json', '--no-color']), takes = new Set(['--seed', '--width', '--height', '--delay', '--svg']);
  for (let i = 0; i < args.length; i++) { const arg = args[i]; if (flags.has(arg)) options[arg] = true; else if (takes.has(arg)) { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`); options[arg] = value; } else throw new Error(`unknown option: ${arg}`); }
  const integer = (name, fallback, max) => { const raw = options[name]; if (raw === undefined) return fallback; if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) throw new Error(`${name} must be an integer from 0 to ${max}`); return Number(raw); };
  const live = !!(process.stdout.isTTY && process.stdin.isTTY && !options['--json'] && !options['--svg']);
  const fitOdd = n => Math.max(9, n % 2 ? n : n - 1);
  const width = integer('--width', live ? fitOdd(Math.min(41, Math.floor(((process.stdout.columns || 90) - 4) / 2))) : 41, 101);
  const height = integer('--height', live ? fitOdd(Math.min(21, (process.stdout.rows || 28) - 5)) : 21, 101);
  let seed = integer('--seed', 42, 0xffffffff), delay = integer('--delay', 20, 1000);
  let maze = createMaze({ width, height, seed }), searches = ['bfs', 'astar'].map(a => createSearch(maze, a));
  const solve = () => { for (const s of searches) while (!s.done) step(s); };
  if (options['--json'] || options['--svg']) {
    solve();
    if (options['--svg']) await writeFile(options['--svg'], renderSVG(searches));
    if (options['--json']) console.log(JSON.stringify(analyze(maze), null, 2));
  } else {
    let paused = false, running = true;
    const reset = () => { maze = createMaze({ width, height, seed }); searches = ['bfs', 'astar'].map(a => createSearch(maze, a)); };
    const input = data => { for (const key of data.toString()) {
      if (key === 'q' || key === '\x03') running = false;
      else if (key === 'p' || key === ' ') paused = !paused;
      else if (key === 'n') { seed = (seed + 1) >>> 0; reset(); }
      else if (key === 'r') reset();
      else if (key === '+' || key === '=') delay = Math.max(1, Math.floor(delay / 2));
      else if (key === '-') delay = Math.min(1000, Math.max(1, delay) * 2);
    } };
    const stop = () => { running = false; };
    if (live) {
      const wasRaw = process.stdin.isRaw; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', input); process.on('SIGINT', stop); process.on('SIGTERM', stop);
      process.stdout.write('\x1b[?1049h\x1b[?25l');
      restore = () => { process.stdin.off('data', input); process.stdin.setRawMode(!!wasRaw); process.stdin.pause(); process.off('SIGINT', stop); process.off('SIGTERM', stop); process.stdout.write('\x1b[?25h\x1b[?1049l'); };
    } else solve();
    do {
      if (live && !paused) searches.forEach(s => step(s));
      const text = `MAZE SEARCH RACE | seed ${seed}${paused ? ' | PAUSED' : ''}\n${render(searches, { color: live && !options['--no-color'] && !process.env.NO_COLOR })}\n. explored + frontier * path | p pause n new r restart +/- speed q quit\n`;
      process.stdout.write(live ? `\x1b[H\x1b[J${text}` : text);
      if (!live) break;
      await new Promise(resolve => setTimeout(resolve, searches.every(s => s.done) ? 100 : delay));
    } while (running);
    restore(); restore = () => {};
  }
} catch (error) { restore(); console.error(`maze-search-race: ${error.message}`); process.exitCode = 2; }
