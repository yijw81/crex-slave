export type LogLevel = 'info' | 'rx' | 'tx' | 'state' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface SerialSettings {
  path: string;
  baudRate: number;
  slaveId: number;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface UiState {
  connected: boolean;
  portPath?: string;
  baudRate: number;
  slaveId: number;
  registers: Record<string, number>;
  delays: number[];
  simulationRunning: boolean;
}
