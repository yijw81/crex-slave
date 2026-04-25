import { LogEntry, PortInfo, SerialSettings, UiState } from '../shared/types';

declare global {
  interface Window {
    api: {
      listPorts: () => Promise<PortInfo[]>;
      connect: (settings: SerialSettings) => Promise<boolean>;
      disconnect: () => Promise<boolean>;
      getState: () => Promise<UiState>;
      onState: (handler: (state: UiState) => void) => void;
      getLogs: () => Promise<LogEntry[]>;
      clearLogs: () => Promise<boolean>;
      onLog: (handler: (log: LogEntry) => void) => void;
      setStatus: (status: number) => Promise<void>;
      setDelay: (index: number, delayMs: number) => Promise<void>;
      forceFault: () => Promise<void>;
      clearFaults: () => Promise<void>;
      setBitfield: (type: 'fault1' | 'fault2' | 'alarm', bits: number[]) => Promise<void>;
      getBitDefinitions: () => Promise<{
        fault1: Array<{ bit: number; label: string }>;
        fault2: Array<{ bit: number; label: string }>;
        alarm: Array<{ bit: number; label: string }>;
        statuses: Record<string, string>;
      }>;
    };
  }
}

export {};
