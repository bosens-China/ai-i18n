/** 本地 dev 时 example Vite 端口，需与各 example 的 package.json 保持一致。 */
export const DEMO_PORTS = {
  vanilla: 51881,
  vue: 51882,
  react: 51883,
} as const;

export type DemoFramework = keyof typeof DEMO_PORTS;

export function demoDevUrl(framework: DemoFramework): string {
  return `http://localhost:${DEMO_PORTS[framework]}/`;
}

export function demoProdUrl(framework: DemoFramework, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}examples/${framework}/`;
}
