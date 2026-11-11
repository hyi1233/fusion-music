import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // React 19 的 production 构建不再导出 `act`；有些 CI/终端全局设了 NODE_ENV=production，
    // 会让 jsdom 页面测试整组失败。测试进程内强制使用 development 构建。
    env: { NODE_ENV: 'test' },
  },
})
