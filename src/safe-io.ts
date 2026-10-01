import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';

export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Never execute repository content; bound reads and refuse linked/non-regular files. */
export async function readLocalFile(root: string, filename: string, limit: number): Promise<{ text: string; bytes: number }> {
  if (!isWithin(root, await realpath(path.dirname(filename)))) throw new Error('File directory escapes scan root');
  if ((await lstat(filename)).isSymbolicLink()) throw new Error('Symbolic links are not followed');
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Not a regular file');
    if (info.size > limit) throw new Error('File size limit exceeded');
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const chunk = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (!chunk.bytesRead) break;
      bytes += chunk.bytesRead;
    }
    if (bytes > limit) throw new Error('File size limit exceeded');
    return { text: buffer.subarray(0, bytes).toString('utf8'), bytes };
  } finally { await handle.close(); }
}

/** Display controls visibly, so untrusted filenames/instructions cannot operate a terminal. */
export function terminalText(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
