import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMaze, createSearch, step, analyze, render, renderSVG } from '../src/index.js';
const cli = args => spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
const solve = s => { while (!s.done) step(s); return s; };
test('seeded mazes are deterministic, connected, and acyclic with closed borders', () => {
  for (const seed of [0, 1, 42, 137, 4294967295]) {
    const m = createMaze({ width: 21, height: 15, seed }); assert.deepEqual(m, createMaze({ width: 21, height: 15, seed }));
    assert.ok([...m.grid[0] + m.grid.at(-1)].every(c => c === '#')); assert.ok(m.grid.every(row => row[0] === '#' && row.at(-1) === '#'));
    const seen = new Set([m.start]), todo = [m.start]; let edges = 0;
    for (let i = 0; i < todo.length; i++) {
      const id = todo[i], x = id % m.width, y = Math.floor(id / m.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = (y + dy) * m.width + x + dx;
        if (m.grid[y + dy]?.[x + dx] !== ' ') continue;
        edges++; if (!seen.has(next)) { seen.add(next); todo.push(next); }
      }
    }
    const open = m.grid.join('').split('').filter(c => c === ' ').length;
    assert.equal(seen.size, open); assert.equal(edges / 2, open - 1); assert.ok(seen.has(m.goal));
  }
});
test('BFS and A* find equal shortest paths and all reported steps are traversable', () => {
  for (let seed = 0; seed < 30; seed++) {
    const m = createMaze({ width: 21, height: 15, seed }), report = analyze(m);
    assert.equal(report.results[0].pathLength, report.results[1].pathLength);
    for (const r of report.results) {
      assert.equal(r.found, true); assert.equal(r.path[0], m.start); assert.equal(r.path.at(-1), m.goal);
      assert.equal(new Set(r.path).size, r.path.length);
      r.path.forEach((id, i) => { const x = id % m.width, y = Math.floor(id / m.width); assert.equal(m.grid[y][x], ' '); if (i) { const prev = r.path[i - 1]; assert.equal(Math.abs(x - prev % m.width) + Math.abs(y - Math.floor(prev / m.width)), 1); } });
    }
  }
});
test('A* handles cycles and unreachable goals; start equal to goal is zero steps', () => {
  const cyclic = { width: 5, height: 5, start: 6, goal: 18, grid: ['#####', '#   #', '# # #', '#   #', '#####'] };
  for (const algorithm of ['bfs', 'astar']) { const s = solve(createSearch(cyclic, algorithm)); assert.equal(s.path.length - 1, 4); }
  const blocked = { width: 5, height: 3, start: 6, goal: 8, grid: ['#####', '# # #', '#####'] };
  assert.ok(analyze(blocked).results.every(r => !r.found && r.pathLength === null));
  assert.equal(solve(createSearch({ ...cyclic, goal: cyclic.start })).path.length, 1);
});
test('batch and single steps agree and completed searches remain unchanged', () => {
  const m = createMaze(), a = createSearch(m, 'astar'), b = createSearch(m, 'astar'); step(a, 10); for (let i = 0; i < 10; i++) step(b); assert.deepEqual(a, b);
  solve(a); const expanded = a.expanded; step(a, 100); assert.equal(a.expanded, expanded);
  for (const count of [-1, 1.5, Infinity]) assert.throws(() => step(b, count));
});
test('validates dimensions, seed, algorithms, and invalid grids', () => {
  for (const options of [{ width: 10 }, { height: 2 }, { seed: -1 }, { seed: 4294967296 }]) assert.throws(() => createMaze(options));
  assert.throws(() => createSearch(null)); assert.throws(() => createSearch(createMaze(), 'dijkstra'));
  assert.throws(() => createSearch({ width: 1, height: 1, grid: ['#'], start: 0, goal: 0 }));
});
test('terminal and SVG renderers show both searches and final paths', () => {
  const m = createMaze({ width: 9, height: 9 }), searches = ['bfs', 'astar'].map(a => solve(createSearch(m, a)));
  assert.match(render(searches), /BFS/); assert.match(render(searches), /A\*/); assert.match(render(searches), /\*/);
  assert.equal(render(searches).includes('\x1b'), false); assert.ok(render(searches, { color: true }).includes('\x1b['));
  assert.match(renderSVG(searches), /^<svg/); assert.throws(() => render([searches[0]]));
});
test('CLI supports deterministic JSON, plain output, and invalid input exit codes', () => {
  const r = cli(['--seed', '1', '--json']); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).seed, 1);
  const frame = cli(['--width', '9', '--height', '9']); assert.equal(frame.status, 0); assert.match(frame.stdout, /MAZE SEARCH RACE/); assert.equal(frame.stdout.includes('\x1b'), false);
  for (const args of [['--seed'], ['--seed', '-1'], ['--width', '10'], ['--delay', '1001'], ['--wat']]) assert.equal(cli(args).status, 2);
  assert.equal(cli(['--help']).status, 0);
});
test('CLI creates SVG artifacts and reports write errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maze-test-'));
  try { const file = join(dir, 'maze.svg'); assert.equal(cli(['--seed', '1', '--svg', file]).status, 0); assert.match(readFileSync(file, 'utf8'), /SEED 1/); assert.equal(cli(['--svg', join(dir, 'missing', 'x.svg')]).status, 2); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
