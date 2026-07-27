import { fail, McpToolError } from './errors.js';

export interface OverrideTarget {
  scope: 'default' | 'message';
  source: string;
  message_id?: string;
  locale: string;
}

export function encodeOverrideId(target: OverrideTarget): string {
  // ID 只负责稳定寻址，Agent 应始终从列表结果原样复制。
  return Buffer.from(JSON.stringify(target)).toString('base64url');
}

export function decodeOverrideId(value: string): OverrideTarget {
  try {
    const target = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const keys = Object.keys(target).sort().join(',');
    const expectedKeys =
      target.scope === 'message'
        ? 'locale,message_id,scope,source'
        : 'locale,scope,source';
    if (
      keys !== expectedKeys ||
      (target.scope !== 'default' && target.scope !== 'message') ||
      typeof target.source !== 'string' ||
      typeof target.locale !== 'string' ||
      !target.locale ||
      (target.scope === 'message' &&
        (typeof target.message_id !== 'string' || !target.message_id))
    ) {
      fail('INVALID_OVERRIDE_ID', { override_id: value });
    }
    return target as unknown as OverrideTarget;
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    fail('INVALID_OVERRIDE_ID', { override_id: value });
  }
}

export function overrideTargetKey(target: OverrideTarget): string {
  return [
    target.scope,
    target.source,
    target.message_id ?? '',
    target.locale,
  ].join('\0');
}
