const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');

const root = __dirname;
const repository = path.join(root, 'work', 'boyue-site');
const bundler = path.join(root, 'work', 'rack-validation', 'build-project-files-only.cjs');
const pythonOptions = process.env.PYTHON
  ? [[process.env.PYTHON]]
  : [['python'], ['py', '-3'], ['python3']];
const python = pythonOptions.find(([exe, ...args]) =>
  spawnSync(exe, [...args, '-c', 'import sys; sys.exit(sys.version_info.major != 3)']).status === 0
);
if (!python) throw new Error('Python 3 is required. Set PYTHON to its executable path.');
for (const [entry, output] of [
  ['stage1/main.js', 'stage1.bundle.js'],
  ['stage1/floor-worker.js', 'floor-worker.bundle.js'],
  ['stage1/rack-worker.js', 'rack-worker.bundle.js'],
]) {
  execFileSync(process.execPath, [bundler, repository, entry, output], {stdio: 'inherit'});
}
execFileSync(python[0], [...python.slice(1), path.join(repository, 'build_stage1.py')], {stdio: 'inherit'});
