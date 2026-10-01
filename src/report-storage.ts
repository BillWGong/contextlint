import { mkdir, writeFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { isWithin } from './safe-io.js';

async function historyDirectory(root: string): Promise<string> {
  let directory = await realpath(root);
  for (const part of ['.contextlint', 'reports']) {
    directory = path.join(directory, part);
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Report history must use real directories, not symbolic links');
  }
  return directory;
}

/** Keep independent private history. Replace regular output copies atomically, never link targets. */
export async function saveHtmlReport(root: string, content: string, requestedPath?: string) {
  const directory = await historyDirectory(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(directory, `report-${stamp}-${randomUUID()}.html`);
  await writeFile(archivePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const outputPath = requestedPath ? path.resolve(requestedPath) : archivePath;
  if (outputPath !== archivePath) {
    let temporary: string | undefined;
    try {
      const canonicalRoot = await realpath(root);
      let ancestor = path.dirname(outputPath);
      while (true) {
        try {
          const resolved = await realpath(ancestor);
          if (isWithin(path.resolve(root), outputPath) && !isWithin(canonicalRoot, resolved)) {
            throw new Error('Report output directory escapes scan root through a symbolic link');
          }
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          const parent = path.dirname(ancestor);
          if (parent === ancestor) throw error;
          ancestor = parent;
        }
      }
      await mkdir(path.dirname(outputPath), { recursive: true });
      // Resolve the parent once; atomic rename replaces the entry rather than following it.
      const parent = await realpath(path.dirname(outputPath));
      if (isWithin(path.resolve(root), outputPath) && !isWithin(canonicalRoot, parent)) throw new Error('Report output directory escapes scan root');
      const destination = path.join(parent, path.basename(outputPath));
      try {
        const info = await lstat(destination);
        if (info.isSymbolicLink() || !info.isFile()) throw new Error('Report output must be a regular file, not a symbolic link');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      temporary = path.join(parent, `.contextlint-${randomUUID()}.tmp`);
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } catch (error) {
      throw new Error(`Output copy failed (${error instanceof Error ? error.message : String(error)}). Report retained: ${archivePath}`);
    } finally { if (temporary) await rm(temporary, { force: true }); }
  }
  return { outputPath, archivePath };
}
