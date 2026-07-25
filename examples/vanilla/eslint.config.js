import aiI18n from '@ai-i18n/eslint-plugin';
import { defineConfig } from 'eslint/config';
import rootConfig from '../../eslint.config.js';

export default defineConfig([rootConfig, aiI18n.configs.recommended]);
