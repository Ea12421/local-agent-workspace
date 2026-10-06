import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['--experimental-strip-types', '--check', 'apps/server/src/index.ts']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.server.json', '--noEmit']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'apps/web/tsconfig.json', '--noEmit']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'apps/desktop/tsconfig.json', '--noEmit']);
console.log('TypeScript syntax and workspace type checks passed.');
