export const MESSAGE_ID_VERSION = 2;

export function escapeMessageIdPart(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/#/g, '\\#');
}

export function normalizeComment(comment?: string): string | undefined {
  const normalized = comment?.trim();
  return normalized ? normalized : undefined;
}

export function createMessageId(source: string, _comment?: string): string {
  // 保留第二参数兼容现有调用，但 comment 不再参与 ID。
  void _comment;
  return escapeMessageIdPart(source);
}

export function parseMessageId(id: string): {
  source: string;
  comment?: string;
} {
  let source = '';
  let comment = '';
  let escaped = false;
  let inComment = false;

  for (const char of id) {
    if (escaped) {
      if (inComment) comment += char;
      else source += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '#' && !inComment) {
      inComment = true;
    } else {
      if (inComment) comment += char;
      else source += char;
    }
  }

  if (escaped) {
    if (inComment) comment += '\\';
    else source += '\\';
  }
  return inComment && comment ? { source, comment } : { source };
}
