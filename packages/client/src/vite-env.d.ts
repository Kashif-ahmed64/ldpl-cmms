/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ldplCmms?: {
    getServerUrl: () => Promise<string>;
    setServerUrl: (url: string) => Promise<string>;
    isDesktop: boolean;
  };
}
