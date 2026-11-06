// Web 版全局声明：Folia 桌面残留的 Electron 桥、构建期常量与虚拟模块
declare global {
  interface Window {
    // Folia 桌面桥在 Web 版不注入，类型放开以通过编译
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    electron?: any;
    __FOLIA_RUNTIME_CONFIG__?: unknown;
  }
  const __BUILD_REPO__: string;
  const __BUILD_COMMIT__: string;
  const __BUILD_KIND__: string;
  const __BUILD_HOST__: string;
  const __APP_VERSION__: string;
  // 这些名字在 Folia 原代码里既当值也当类型用；Web 版给最小 any 壳
  declare const AiConnectionTestPayload: any;
  type AiConnectionTestPayload = any;
  type AiModelListResult = any;
  type AiConnectionTestResult = any;
  declare const ElectronNetworkConnection: any;
  type ElectronNetworkConnection = any;
  declare const ElectronLoginDiagnostics: any;
  type ElectronLoginDiagnostics = any;
  declare const ElectronBackendStartupRun: any;
  type ElectronBackendStartupRun = any;
  declare const ElectronAppEnvironment: any;
  type ElectronAppEnvironment = any;
}
export {};

declare module '*.json' {
  const value: unknown;
  export default value;
}
