import { createHash } from 'node:crypto';

export function messageKey(message: { source: string; comment?: string }) {
  return createHash('sha256')
    .update(JSON.stringify([message.source, message.comment ?? null]))
    .digest('hex');
}

// 固定译文模拟服务端翻译成果，不调用外部模型，也不以源码位置作为 key。
export const entries = [
  ['远程译文演示', 'Remote translations'],
  ['语言', 'Language'],
  ['当前页面快照', 'Applied snapshot'],
  ['服务端最新版本', 'Server release'],
  ['尚未获取', 'Not loaded yet'],
  ['保存成功', 'Saved successfully'],
  [
    '远程叠加：服务器优先，其余使用本地译文。',
    'Overlay: server copy wins; other copy stays local.',
  ],
  ['启用部分远程覆盖', 'Apply partial remote overrides'],
  ['撤销全部远程覆盖', 'Withdraw all remote overrides'],
  [
    '撤销后恢复本地人工译文。',
    'Withdrawal restores the reviewed local translation.',
  ],
  ['同一句原文，不同语境', 'Same source, different contexts'],
  ['提交', 'Submit', '表单按钮'],
  ['提交', 'Commit', 'Git 操作'],
  ['打开懒加载示例', 'Open lazy example'],
  ['这是懒加载页面的文案。', 'This copy comes from a lazy module.'],
  ['读取服务端状态', 'Read server status'],
  ['发布下一版译文', 'Publish next translation release'],
  ['模拟缺译', 'Simulate missing translation'],
  ['模拟无效译文', 'Simulate invalid translation'],
  ['恢复完整译文', 'Restore complete translations'],
  ['重启 Dev 并获取', 'Restart Dev and fetch'],
  [
    '服务端更新不会自动替换当前快照。',
    'A server release does not replace the applied snapshot automatically.',
  ],
  [
    '开发服务重启后会重新提交和获取；静态页面需要重新构建。',
    'Restart Dev to submit and fetch again; rebuild a static page to update it.',
  ],
  ['已接收文案', 'Received messages'],
  ['提交次数', 'Publish requests'],
  ['获取次数', 'Snapshot requests'],
  ['测试场景', 'Test scenario'],
  ['操作完成', 'Operation completed'],
  ['请求失败，请查看终端。', 'Request failed. Check the terminal.'],
  [
    '静态构建快照，不连接后端。',
    'Static build snapshot. No backend connection.',
  ],
  [
    '此处可以查看服务器实际收到的 key。',
    'These are the keys received by the server.',
  ],
] as const;

export const catalog = new Map<string, { source: string; value: string }>(
  entries.map(([source, value, comment]) => [
    messageKey({ source, comment }),
    { source, value },
  ]),
);
export const saveKey = messageKey({ source: '保存成功' });
