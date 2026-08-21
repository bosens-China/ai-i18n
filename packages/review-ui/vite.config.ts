import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createGenerator } from 'unocss';
import unoConfig from './uno.config.ts';

const REVIEW_STYLE_ID = '/review-ui.css';
const RESOLVED_REVIEW_STYLE_ID = '\0ai-i18n:review-ui.css';
const REVIEW_STYLE_FILES = [
  'theme.css',
  'layout.css',
  'list.css',
  'studio.css',
  'main.css',
] as const;

function shadowStyles(): Plugin {
  return {
    name: 'ai-i18n:review-shadow-styles',
    enforce: 'pre',
    resolveId(id) {
      if (id === REVIEW_STYLE_ID || id.startsWith(`${REVIEW_STYLE_ID}?`)) {
        return `${RESOLVED_REVIEW_STYLE_ID}${id.slice(REVIEW_STYLE_ID.length)}`;
      }
    },
    async load(id) {
      if (id.split('?', 1)[0] !== RESOLVED_REVIEW_STYLE_ID) return;
      const root = fileURLToPath(new URL('.', import.meta.url));
      const [reset, styles, sources] = await Promise.all([
        fs.readFile(
          fileURLToPath(import.meta.resolve('@unocss/reset/tailwind.css')),
          'utf8',
        ),
        Promise.all(
          REVIEW_STYLE_FILES.map((file) =>
            fs.readFile(path.join(root, 'src/styles', file), 'utf8'),
          ),
        ),
        readSources(path.join(root, 'src')),
      ]);
      const generator = await createGenerator(unoConfig);
      const generated = await generator.generate(sources);
      return `${reset}\n${generated.css}\n${styles.join('\n')}`;
    },
  };
}

async function readSources(directory: string): Promise<string> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return readSources(filename);
      return /\.(?:ts|vue)$/.test(entry.name)
        ? fs.readFile(filename, 'utf8')
        : '';
    }),
  );
  return contents.join('\n');
}

export default defineConfig({
  base: '/__ai-i18n/',
  plugins: [vue(), shadowStyles()],
  build: {
    target: 'baseline-widely-available',
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/mount.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'review-ui.js',
      cssFileName: 'review-ui',
    },
  },
});
