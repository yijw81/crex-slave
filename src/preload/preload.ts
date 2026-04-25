import { contextBridge, ipcRenderer } from 'electron';
import { LogEntry, PortInfo, SerialSettings, UiState } from '../shared/types';

interface BitDefinition {
  bit: number;
  label: string;
}

contextBridge.exposeInMainWorld('api', {
  listPorts: (): Promise<PortInfo[]> => ipcRenderer.invoke('serial:listPorts'),
  connect: (settings: SerialSettings): Promise<boolean> => ipcRenderer.invoke('serial:connect', settings),
  disconnect: (): Promise<boolean> => ipcRenderer.invoke('serial:disconnect'),

  getState: (): Promise<UiState> => ipcRenderer.invoke('state:get'),
  onState: (handler: (state: UiState) => void) => {
    ipcRenderer.on('state:update', (_event, state: UiState) => handler(state));
  },

  getLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke('log:getAll'),
  clearLogs: (): Promise<boolean> => ipcRenderer.invoke('log:clear'),
  onLog: (handler: (log: LogEntry) => void) => {
    ipcRenderer.on('log:push', (_event, log: LogEntry) => handler(log));
  },

  setStatus: (status: number): Promise<void> => ipcRenderer.invoke('ui:setStatus', status),
  setDelay: (index: number, delayMs: number): Promise<void> => ipcRenderer.invoke('ui:setDelay', index, delayMs),
  forceFault: (): Promise<void> => ipcRenderer.invoke('ui:forceFault'),
  clearFaults: (): Promise<void> => ipcRenderer.invoke('ui:clearFaults'),
  setBitfield: (type: 'fault1' | 'fault2' | 'alarm', bits: number[]): Promise<void> => ipcRenderer.invoke('ui:setBitfield', type, bits),
  getBitDefinitions: (): Promise<{ fault1: BitDefinition[]; fault2: BitDefinition[]; alarm: BitDefinition[]; statuses: Record<string, string> }> =>
    ipcRenderer.invoke('meta:getBitDefinitions')
});

export {};
