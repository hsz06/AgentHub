/// <reference types="vite/client" />

interface Window {
  agentHubDesktop?: {
    selectImportDirectory: () => Promise<{ name: string; contentBase64: string } | null>;
    exportArtifact: (payload: { fileName: string; content: string }) => Promise<boolean>;
    exportText: (payload: { fileName: string; content: string }) => Promise<boolean>;
    notifyDeployment: (title: string) => void;
    notifyAgentRun: (title: string) => void;
  };
}
