import { describe, expect, it } from 'vitest';
import { exampleBasePath, examples } from '../build-pages.mjs';

describe('Pages 构建配置', () => {
  it('为每个示例生成仓库子路径', () => {
    expect(examples.map(([name]) => name)).toEqual([
      'vanilla',
      'vue',
      'react',
      'mixed',
    ]);
    expect(exampleBasePath('/ai-i18n/', 'vue')).toBe('/ai-i18n/vue/');
  });

  it('支持根路径部署', () => {
    expect(exampleBasePath('/', 'react')).toBe('/react/');
  });
});
