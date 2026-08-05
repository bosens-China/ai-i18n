import { createHash } from 'node:crypto';
import { fail } from './errors.js';

const ORPHAN_ID_PATTERN = /^[a-f0-9]{64}$/;

export function createOrphanId(messageId: string): string {
  // 对外只暴露固定长度定位符，不泄露协议内部的 message ID。
  return createHash('sha256').update(messageId).digest('hex');
}

export function validateOrphanId(value: string): string {
  if (!ORPHAN_ID_PATTERN.test(value)) {
    fail('INVALID_ORPHAN_ID', { orphan_id: value });
  }
  return value;
}
