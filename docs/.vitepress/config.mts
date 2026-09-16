import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';

const pkg = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: '/polyglot/',
  title: 'Polyglot',
  description: '将图片与压缩包合为一体 — 一个文件，两种格式',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,

  // Resolve the playground to TypeScript source so the docs site builds without
  // a prior `npm run build` of the workspace packages.
  vite: {
    resolve: {
      alias: {
        '@polyglot/browser': pkg('../../packages/browser/src/index.ts'),
      },
    },
  },

  head: [
    ['meta', { name: 'theme-color', content: '#6c5ce7' }],
    ['meta', { property: 'og:type', content: 'website' }],
  ],

  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/axetroy/polyglot' }],

    locales: {
      root: {
        label: '简体中文',
        lang: 'zh-CN',
        nav: [
          { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
          { text: 'Playground', link: '/playground' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/guide/getting-started' },
                { text: '工作原理', link: '/guide/how-it-works' },
                { text: 'API 参考', link: '/guide/api' },
                { text: '安全模型', link: '/guide/security' },
              ],
            },
          ],
        },
        outline: { label: '本页目录' },
        docFooter: { prev: '上一篇', next: '下一篇' },
        lastUpdated: { text: '最后更新于' },
        returnToTopLabel: '回到顶部',
        darkModeSwitchLabel: '主题',
        sidebarMenuLabel: '菜单',
        editLink: {
          pattern: 'https://github.com/axetroy/polyglot/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页',
        },
      },

      en: {
        label: 'English',
        lang: 'en-US',
        link: '/en/',
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started', activeMatch: '/en/guide/' },
          { text: 'Playground', link: '/en/playground' },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/en/guide/getting-started' },
                { text: 'How It Works', link: '/en/guide/how-it-works' },
                { text: 'API Reference', link: '/en/guide/api' },
                { text: 'Security Model', link: '/en/guide/security' },
              ],
            },
          ],
        },
        outline: { label: 'On this page' },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: { text: 'Last updated' },
        returnToTopLabel: 'Return to top',
        darkModeSwitchLabel: 'Appearance',
        sidebarMenuLabel: 'Menu',
        editLink: {
          pattern: 'https://github.com/axetroy/polyglot/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
      },
    },
  },
});
