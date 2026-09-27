import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspaceRoot = process.cwd();
const sourceRoot = '/Users/m4air/总控/projects/codex-pet-studio/outputs/package/sha-wujing';
const targetRoot = path.join(os.homedir(), '.codex/pets/sha-wujing');
const files = ['pet.json', 'spritesheet.webp'];
const beforePath = path.join(workspaceRoot, 'validation/m8-07-install-before.json');
const afterPath = path.join(workspaceRoot, 'validation/m8-07-install-after.json');
const resultPath = path.join(workspaceRoot, 'validation/m8-07-install-smoke.json');

async function hashFile(filePath) {
  const digest = createHash('sha256');
  digest.update(await readFile(filePath));
  return digest.digest('hex');
}

async function snapshot(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isFile()) records.push({ name: entry.name, type: 'file', bytes: (await stat(entryPath)).size, sha256: await hashFile(entryPath) });
      else if (entry.isDirectory()) records.push({ name: entry.name, type: 'directory' });
      else records.push({ name: entry.name, type: 'other' });
    }
    records.sort((a, b) => a.name.localeCompare(b.name));
    return { path: root, exists: true, entries: records };
  } catch (error) {
    if (error?.code === 'ENOENT') return { path: root, exists: false, entries: [] };
    throw error;
  }
}

async function main() {
  const before = await snapshot(targetRoot);
  await mkdir(path.dirname(beforePath), { recursive: true });
  await writeFile(beforePath, `${JSON.stringify({ record_version: 'm8-07.install-before.v1', captured_at: new Date().toISOString(), target: before, source_root: sourceRoot }, null, 2)}\n`, 'utf8');

  if (before.exists && before.entries.length > 0) {
    throw new Error(`target is not empty; refusing to overwrite: ${targetRoot}`);
  }
  for (const file of files) {
    const source = path.join(sourceRoot, file);
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) throw new Error(`source is not a file: ${source}`);
  }
  await mkdir(targetRoot, { recursive: true });
  for (const file of files) await copyFile(path.join(sourceRoot, file), path.join(targetRoot, file));

  const after = await snapshot(targetRoot);
  const expected = [];
  for (const file of files) expected.push({ name: file, type: 'file', bytes: (await stat(path.join(sourceRoot, file))).size, sha256: await hashFile(path.join(sourceRoot, file)) });
  expected.sort((a, b) => a.name.localeCompare(b.name));
  const installedFilesMatch = JSON.stringify(after.entries) === JSON.stringify(expected);
  await writeFile(afterPath, `${JSON.stringify({ record_version: 'm8-07.install-after.v1', captured_at: new Date().toISOString(), target: after, expected }, null, 2)}\n`, 'utf8');
  const result = {
    record_version: 'm8-07.install-smoke.v1',
    status: installedFilesMatch ? 'PASS_INSTALLED_FILES' : 'NO_GO',
    executed_at: new Date().toISOString(),
    source_root: sourceRoot,
    target_root: targetRoot,
    files,
    before_manifest: path.relative(workspaceRoot, beforePath),
    after_manifest: path.relative(workspaceRoot, afterPath),
    installed_files_match: installedFilesMatch,
    target_writes: files,
    rollback: 'Delete only the newly created sha-wujing directory after user approval if load or visual smoke fails; preserve the before manifest and existing sibling pets.',
    codex_load_status: 'PENDING_COMPUTER_USE',
    user_acceptance: 'PENDING',
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.status, target: targetRoot, files: result.files, computer_use: result.codex_load_status }));
}

await main();
