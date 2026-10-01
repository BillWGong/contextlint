import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/** Keep an independent report for every scan. History is never pruned automatically. */
export async function saveHtmlReport(root: string, content: string, requestedPath?: string) {
  const directory = path.join(root, '.contextlint', 'reports');
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(directory, `report-${stamp}-${randomUUID().slice(0, 8)}.html`);
  await writeFile(archivePath, content, { encoding: 'utf8', flag: 'wx' });
  const outputPath = requestedPath ? path.resolve(requestedPath) : archivePath;
  if (outputPath !== archivePath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf8');
  }
  return { outputPath, archivePath };
}
