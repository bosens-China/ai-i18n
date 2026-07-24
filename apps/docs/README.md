# @ai-i18n/docs

用户文档站（Astro Starlight）。内部 PRD 与 TODO 仍在仓库根目录 `docs/`。

```sh
# 在仓库根目录 — 一键：build 插件包 + 三个 example dev + astro dev
pnpm docs:dev

# 仅构建文档站（demo iframe 走静态 examples 产物）
pnpm docs:build

# 仅并行 example dev / build
pnpm examples:dev      # vanilla:51881  vue:51882  react:51883
pnpm examples:build
```

- **开发**：demo 页 iframe 指向 `http://localhost:5188x/`（见 `apps/docs/src/lib/demo-urls.ts`）
- **构建/部署**：demo 页 iframe 指向同域 `/examples/{vanilla,vue,react}/`

GitHub Pages 构建时设置 `DEPLOY_TARGET=pages`，以使用 `/ai-i18n` base。
