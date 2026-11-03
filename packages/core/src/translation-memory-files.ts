import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';
import { parseProtocolJson } from './protocol-json.js';

const JOURNAL = '.transaction.json';
const queues = new Map<string, Promise<unknown>>();

/** 同进程按目录排序；不提供跨进程互斥。 */
export async function withFileQueue<T>(
  file: string,
  task: () => Promise<T>,
): Promise<T> {
  const resolved = path.resolve(file);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous.then(task, task);
  queues.set(key, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(key) === pending) queues.delete(key);
  }
}

export async function readJson(
  file: string,
  onDuplicates?: () => void,
): Promise<unknown | undefined> {
  const document = await readJsonDocument(file);
  if (document?.duplicateCount) onDuplicates?.();
  return document?.value;
}

async function readJsonDocument(file: string) {
  try {
    return parseProtocolJson(await fs.readFile(file, 'utf8'), file);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function atomicJsonJournalPath(directory: string): string {
  return path.join(directory, JOURNAL);
}

export async function listAtomicJsonFiles(
  directory: string,
): Promise<string[]> {
  const files: string[] = [];
  await visit(directory, files);
  return files.sort();
}

export async function syncAtomicJsonFiles<T>(
  directory: string,
  desired: ReadonlyMap<string, T>,
  serialize: (value: T) => string = stableJson,
): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const existing = await listAtomicJsonFiles(directory);
  // 先检查整组现存文件，日志恢复或删除旧分桶也不能覆盖尚未解决的重复键冲突。
  const documents = new Map<
    string,
    Awaited<ReturnType<typeof readJsonDocument>>
  >();
  for (const file of new Set([...existing, ...desired.keys()])) {
    documents.set(file, await readJsonDocument(file));
  }
  for (const [file, entry] of desired) {
    const serialized = serialize(entry);
    const current = documents.get(file);
    if (
      current &&
      !current.duplicateCount &&
      stableJson(current.value) === stableJson(entry)
    ) {
      continue;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serialized, {
      encoding: 'utf8',
      chown: false,
      mode: false,
    });
  }
  const keep = new Set([...desired.keys()].map((file) => path.resolve(file)));
  for (const file of existing) {
    if (!keep.has(path.resolve(file))) await fs.rm(file, { force: true });
  }
  await fs.rm(atomicJsonJournalPath(directory), { force: true });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function visit(directory: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file, files);
    else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      entry.name !== JOURNAL
    ) {
      files.push(file);
    }
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  // 使用固定码元顺序，避免生成文件随系统 locale 改变。
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortValue(entry)]),
  );
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
