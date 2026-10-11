const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export function createMaze({ width = 41, height = 21, seed = 42 } = {}) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 9 && n <= 101 && n % 2 === 1)) throw new Error('maze dimensions must be odd integers from 9 to 101');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an integer from 0 to 4294967295');
  let state = seed;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const grid = Array.from({ length: height }, () => Array(width).fill('#')), stack = [[1, 1]];
  grid[1][1] = ' ';
  while (stack.length) {
    const [x, y] = stack[stack.length - 1], choices = directions.filter(([dx, dy]) => grid[y + dy * 2]?.[x + dx * 2] === '#' && x + dx * 2 > 0 && x + dx * 2 < width - 1 && y + dy * 2 > 0 && y + dy * 2 < height - 1);
    if (!choices.length) { stack.pop(); continue; }
    const [dx, dy] = choices[Math.floor(random() * choices.length)];
    grid[y + dy][x + dx] = ' '; grid[y + dy * 2][x + dx * 2] = ' '; stack.push([x + dx * 2, y + dy * 2]);
  }
  return { width, height, seed, start: width + 1, goal: (height - 2) * width + width - 2, grid: grid.map(row => row.join('')) };
}
const distance = (maze, id) => Math.abs(id % maze.width - maze.goal % maze.width) + Math.abs(Math.floor(id / maze.width) - Math.floor(maze.goal / maze.width));
export function createSearch(maze, algorithm = 'bfs') {
  if (!['bfs', 'astar'].includes(algorithm)) throw new Error('algorithm must be bfs or astar');
  if (!maze || !Number.isInteger(maze.width) || !Number.isInteger(maze.height) || maze.width < 1 || maze.height < 1 || !Array.isArray(maze.grid) || maze.grid.length !== maze.height || maze.grid.some(row => typeof row !== 'string' || row.length !== maze.width || /[^# ]/.test(row))) throw new Error('invalid maze');
  for (const id of [maze.start, maze.goal]) if (!Number.isInteger(id) || id < 0 || id >= maze.width * maze.height || maze.grid[Math.floor(id / maze.width)][id % maze.width] === '#') throw new Error('start and goal must be open cells');
  return { maze, algorithm, open: [{ id: maze.start, cost: 0, h: distance(maze, maze.start), order: 0 }], head: 0, order: 1, costs: new Map([[maze.start, 0]]), parents: new Map(), frontier: new Set([maze.start]), explored: new Set(), path: [], done: false, found: false, expanded: 0 };
}
export function step(search, count = 1) {
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('step count must be an integer from 0 to 100000');
  for (let n = 0; n < count && !search.done; n++) {
    if (search.algorithm === 'astar') search.open.sort((a, b) => (a.cost + a.h) - (b.cost + b.h) || a.h - b.h || a.order - b.order);
    let node;
    do { node = search.algorithm === 'bfs' ? search.open[search.head++] : search.open.shift(); } while (node && (search.explored.has(node.id) || node.cost !== search.costs.get(node.id)));
    if (!node) { search.done = true; break; }
    search.frontier.delete(node.id); search.explored.add(node.id); search.expanded++;
    if (node.id === search.maze.goal) {
      search.done = true; search.found = true;
      let id = node.id; search.path.push(id);
      while (search.parents.has(id)) { id = search.parents.get(id); search.path.push(id); }
      search.path.reverse(); break;
    }
    const { width, height, grid } = search.maze, x = node.id % width, y = Math.floor(node.id / width);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy, id = ny * width + nx, cost = node.cost + 1;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || grid[ny][nx] === '#' || search.explored.has(id) || cost >= (search.costs.get(id) ?? Infinity)) continue;
      search.costs.set(id, cost); search.parents.set(id, node.id); search.frontier.add(id);
      search.open.push({ id, cost, h: distance(search.maze, id), order: search.order++ });
    }
  }
  return search;
}
export function analyze(maze) {
  const results = ['bfs', 'astar'].map(algorithm => { const s = createSearch(maze, algorithm); while (!s.done) step(s); return { algorithm, found: s.found, expanded: s.expanded, pathLength: s.found ? s.path.length - 1 : null, path: s.path }; });
  return { seed: maze.seed, width: maze.width, height: maze.height, openCells: maze.grid.reduce((n, row) => n + [...row].filter(c => c === ' ').length, 0), results };
}
function cell(search, x, y, path) {
  const id = y * search.maze.width + x;
  if (id === search.maze.start) return 'S'; if (id === search.maze.goal) return 'G';
  if (search.maze.grid[y][x] === '#') return '#';
  if (path.has(id)) return '*'; if (search.frontier.has(id)) return '+'; if (search.explored.has(id)) return '.';
  return ' ';
}
export function render(searches, { color = false } = {}) {
  if (!Array.isArray(searches) || searches.length !== 2 || searches[0].maze !== searches[1].maze) throw new Error('render requires two searches of the same maze');
  const width = searches[0].maze.width, paths = searches.map(s => new Set(s.path));
  const ink = { '#': 90, '.': 34, '+': 33, '*': 32, S: 36, G: 35 };
  const labels = searches.map(s => `${s.algorithm === 'bfs' ? 'BFS' : 'A*'} ${s.expanded}${s.done ? s.found ? ' DONE' : ' NO PATH' : ''}`.padEnd(Math.max(width, 16))).join('   ');
  const rows = searches[0].maze.grid.map((_, y) => searches.map((s, i) => {
    const chars = Array.from({ length: width }, (_, x) => cell(s, x, y, paths[i]));
    const text = chars.map(c => color && ink[c] ? `\x1b[${ink[c]}m${c}\x1b[0m` : c).join('');
    return text + ' '.repeat(Math.max(0, 16 - width));
  }).join('   '));
  return [labels, ...rows].join('\n');
}
export function renderSVG(searches) {
  const maze = searches[0].maze, size = Math.min(14, 560 / maze.height), panel = maze.width * size, width = Math.max(760, panel * 2 + 96), height = maze.height * size + 150;
  const fill = { '#': '#203048', '.': '#294f83', '+': '#ffd166', '*': '#5de4c7', S: '#e8edf8', G: '#f48fb1' };
  const panels = searches.map((s, i) => {
    const path = new Set(s.path), left = 32 + i * (panel + 32);
    const cells = maze.grid.map((row, y) => [...row].map((_, x) => { const c = cell(s, x, y, path); return c === ' ' ? '' : `<rect x="${left + x * size}" y="${104 + y * size}" width="${size - 1}" height="${size - 1}" fill="${fill[c]}"/>`; }).join('')).join('');
    return `<text x="${left}" y="86" font-family="monospace" fill="#e8edf8">${s.algorithm.toUpperCase()} / ${s.expanded} expanded / ${s.found ? s.path.length - 1 + ' steps' : 'searching'}</text>${cells}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="20" fill="#0d1525"/><text x="32" y="40" font-family="monospace" font-size="24" fill="#e8edf8">MAZE SEARCH RACE / SEED ${maze.seed}</text>${panels}<text x="32" y="${height - 18}" font-family="monospace" fill="#93a4bc">Blue explored / yellow frontier / mint shortest path / pink goal</text></svg>\n`;
}
