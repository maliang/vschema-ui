import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/vschema/',
  title: 'VSchema',
  description: 'Vue 3 JSON Schema 动态 UI 渲染器',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vschema/logo.svg' }],
  ],

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '指南', link: '/guide/getting-started' },
          { text: 'API', link: '/api/schema' },
          { text: '示例', link: '/examples/basic' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: '入门',
              items: [
                { text: '快速开始', link: '/guide/getting-started' },
                { text: '安装', link: '/guide/installation' },
                { text: '基础概念', link: '/guide/concepts' },
              ],
            },
            {
              text: '核心功能',
              items: [
                { text: '响应式数据', link: '/guide/reactivity' },
                { text: '表达式语法', link: '/guide/expressions' },
                { text: '事件处理', link: '/guide/events' },
                { text: '条件与循环', link: '/guide/directives' },
                { text: '表单绑定', link: '/guide/forms' },
              ],
            },
            {
              text: '进阶',
              items: [
                { text: 'API 调用', link: '/guide/api' },
                { text: 'WebSocket', link: '/guide/websocket' },
                { text: '插槽', link: '/guide/slots' },
                { text: '生命周期', link: '/guide/lifecycle' },
                { text: '自定义组件', link: '/guide/components' },
              ],
            },
          ],
          '/api/': [
            {
              text: 'API 参考',
              items: [
                { text: 'Schema 结构', link: '/api/schema' },
                { text: '动作类型', link: '/api/actions' },
                { text: '全局配置', link: '/api/config' },
                { text: '组件 Props', link: '/api/props' },
              ],
            },
          ],
          '/examples/': [
            {
              text: '示例',
              items: [
                { text: '基础示例', link: '/examples/basic' },
                { text: '表单示例', link: '/examples/form' },
                { text: '列表示例', link: '/examples/list' },
                { text: '综合示例', link: '/examples/advanced' },
              ],
            },
          ],
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'API', link: '/en/api/schema' },
          { text: 'Examples', link: '/en/examples/basic' },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Quick Start', link: '/en/guide/getting-started' },
                { text: 'Installation', link: '/en/guide/installation' },
                { text: 'Core Concepts', link: '/en/guide/concepts' },
              ],
            },
            {
              text: 'Core Features',
              items: [
                { text: 'Reactivity', link: '/en/guide/reactivity' },
                { text: 'Expressions', link: '/en/guide/expressions' },
                { text: 'Event Handling', link: '/en/guide/events' },
                { text: 'Directives', link: '/en/guide/directives' },
                { text: 'Form Binding', link: '/en/guide/forms' },
              ],
            },
            {
              text: 'Advanced',
              items: [
                { text: 'API Calls', link: '/en/guide/api' },
                { text: 'WebSocket', link: '/en/guide/websocket' },
                { text: 'Slots', link: '/en/guide/slots' },
                { text: 'Lifecycle', link: '/en/guide/lifecycle' },
                { text: 'Custom Components', link: '/en/guide/components' },
              ],
            },
          ],
          '/en/api/': [
            {
              text: 'API Reference',
              items: [
                { text: 'Schema Structure', link: '/en/api/schema' },
                { text: 'Actions', link: '/en/api/actions' },
                { text: 'Global Config', link: '/en/api/config' },
                { text: 'Component Props', link: '/en/api/props' },
              ],
            },
          ],
          '/en/examples/': [
            {
              text: 'Examples',
              items: [
                { text: 'Basic', link: '/en/examples/basic' },
                { text: 'Form', link: '/en/examples/form' },
                { text: 'List', link: '/en/examples/list' },
                { text: 'Advanced', link: '/en/examples/advanced' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/maliang/vschema' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present',
    },
    search: {
      provider: 'local',
    },
  },
});
