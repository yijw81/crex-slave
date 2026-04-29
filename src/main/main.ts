import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { SerialPort } from 'serialport';
import { ModbusRtuSlave } from '../modbus/ModbusRtuSlave';
import {
  ALARM_BITS,
  FAULT1_BITS,
  FAULT2_BITS,
  machineStatusLabel,
  REG_ALARM,
  REG_HOME_OR_FAULT1,
  REG_MACHINE_STATUS,
  REG_RISE_OR_FAULT2,
  RegisterMap
} from '../registers/RegisterMap';
import { WashSimulationEngine } from '../simulation/WashSimulationEngine';
import { LogEntry, SerialSettings, UiState } from '../shared/types';

const registers = new RegisterMap();
const logs: LogEntry[] = [];
let mainWindow: BrowserWindow | null = null;
let currentSettings: SerialSettings = {
  path: '',
  baudRate: 9600,
  slaveId: 1
};

function pushLog(level: LogEntry['level'], message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  logs.push(entry);
  if (logs.length > 5000) {
    logs.shift();
  }
  mainWindow?.webContents.send('log:push', entry);
}

const simulation = new WashSimulationEngine(
  {
    setStatus: (status: number) => {
      registers.writeRegister(REG_MACHINE_STATUS, status);
      publishState();
    }
  },
  (message) => pushLog('state', message)
);

const slave = new ModbusRtuSlave(registers, {
  onLog: pushLog,
  onStateChanged: () => publishState(),
  onWriteStart: (programType) => simulation.start(programType),
  onStop: () => simulation.stop(true),
  onHome: () => pushLog('state', 'Home command executed'),
  onRise: () => pushLog('state', 'Rise command executed')
});

function publishState(): void {
  const state: UiState = {
    connected: slave.isOpen(),
    portPath: currentSettings.path,
    baudRate: currentSettings.baudRate,
    slaveId: currentSettings.slaveId,
    registers: registers.snapshot(),
    delays: simulation.getDelays(),
    simulationRunning: simulation.isRunning()
  };
  mainWindow?.webContents.send('state:update', state);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  publishState();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  simulation.stop(false);
  await slave.close();
});

ipcMain.handle('serial:listPorts', async () => {
  try {
    const ports = await SerialPort.list();
    pushLog('info', `SerialPort.list() returned ${ports.length} port(s).`);
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId
    }));
  } catch (error) {
    pushLog('error', `SerialPort.list() failed: ${(error as Error).message}`);
    return [];
  }
});

ipcMain.handle('serial:connect', async (_event, settings: SerialSettings) => {
  try {
    currentSettings = settings;
    slave.setSlaveId(settings.slaveId);
    pushLog('info', `Connecting to ${settings.path} @ ${settings.baudRate}, slaveId=${settings.slaveId}`);
    await slave.open(settings.path, settings.baudRate);
    publishState();
    return true;
  } catch (error) {
    const message = (error as Error).message;
    pushLog('error', `Connect failed (${settings.path}): ${message}`);
    throw new Error(message);
  }
});

ipcMain.handle('serial:disconnect', async () => {
  await slave.close();
  publishState();
  return true;
});

ipcMain.handle('log:getAll', () => logs);
ipcMain.handle('log:clear', () => {
  logs.length = 0;
  return true;
});

ipcMain.handle('state:get', () => {
  const state: UiState = {
    connected: slave.isOpen(),
    portPath: currentSettings.path,
    baudRate: currentSettings.baudRate,
    slaveId: currentSettings.slaveId,
    registers: registers.snapshot(),
    delays: simulation.getDelays(),
    simulationRunning: simulation.isRunning()
  };
  return state;
});

ipcMain.handle('ui:setStatus', (_event, status: number) => {
  registers.writeRegister(REG_MACHINE_STATUS, status);
  pushLog('state', `Manual status set: ${machineStatusLabel[status] ?? status}`);
  publishState();
});

ipcMain.handle('ui:setDelay', (_event, index: number, value: number) => {
  simulation.updateDelay(index, value);
  pushLog('info', `Delay[${index}] updated to ${value}ms`);
  publishState();
});

ipcMain.handle('ui:forceFault', () => {
  registers.writeRegister(REG_MACHINE_STATUS, 9);
  pushLog('state', 'Machine status forced to Fault (9)');
  publishState();
});

ipcMain.handle('ui:clearFaults', () => {
  registers.writeRegister(REG_HOME_OR_FAULT1, 0);
  registers.writeRegister(REG_RISE_OR_FAULT2, 0);
  registers.writeRegister(REG_ALARM, 0);
  registers.writeRegister(REG_MACHINE_STATUS, 1);
  pushLog('state', 'Fault/Alarm registers cleared and status set to Idle');
  publishState();
});

ipcMain.handle('ui:setBitfield', (_event, type: 'fault1' | 'fault2' | 'alarm', bits: number[]) => {
  const value = bits.reduce((acc, bit) => acc | (1 << bit), 0) & 0xffff;

  if (type === 'fault1') {
    registers.writeRegister(REG_HOME_OR_FAULT1, value);
    pushLog('state', `Fault Code 1 set: 0x${value.toString(16).padStart(4, '0')}`);
  } else if (type === 'fault2') {
    registers.writeRegister(REG_RISE_OR_FAULT2, value);
    pushLog('state', `Fault Code 2 set: 0x${value.toString(16).padStart(4, '0')}`);
  } else {
    registers.writeRegister(REG_ALARM, value);
    pushLog('state', `Alarm Code set: 0x${value.toString(16).padStart(4, '0')}`);
  }

  publishState();
});

ipcMain.handle('meta:getBitDefinitions', () => ({
  fault1: FAULT1_BITS,
  fault2: FAULT2_BITS,
  alarm: ALARM_BITS,
  statuses: machineStatusLabel
}));
