import { LogEntry, PortInfo, UiState } from '../shared/types';

const portSelect = document.getElementById('portSelect') as HTMLSelectElement;
const refreshPorts = document.getElementById('refreshPorts') as HTMLButtonElement;
const portInput = document.getElementById('portInput') as HTMLInputElement;
const portDebug = document.getElementById('portDebug') as HTMLDivElement;
const baudRate = document.getElementById('baudRate') as HTMLInputElement;
const slaveId = document.getElementById('slaveId') as HTMLInputElement;
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const testAlertBtn = document.getElementById('testAlertBtn') as HTMLButtonElement;
const connectionStatus = document.getElementById('connectionStatus') as HTMLDivElement;
const registerView = document.getElementById('registerView') as HTMLDivElement;
const statusSelect = document.getElementById('statusSelect') as HTMLSelectElement;
const setStatusBtn = document.getElementById('setStatusBtn') as HTMLButtonElement;
const delayContainer = document.getElementById('delayContainer') as HTMLDivElement;
const forceFaultBtn = document.getElementById('forceFaultBtn') as HTMLButtonElement;
const clearFaultBtn = document.getElementById('clearFaultBtn') as HTMLButtonElement;
const fault1Bits = document.getElementById('fault1Bits') as HTMLDivElement;
const fault2Bits = document.getElementById('fault2Bits') as HTMLDivElement;
const alarmBits = document.getElementById('alarmBits') as HTMLDivElement;
const clearLogsBtn = document.getElementById('clearLogsBtn') as HTMLButtonElement;
const logView = document.getElementById('logView') as HTMLDivElement;
const simBadge = document.getElementById('simBadge') as HTMLSpanElement;

let latestState: UiState | null = null;
let bitDefs: { fault1: Array<{ bit: number; label: string }>; fault2: Array<{ bit: number; label: string }>; alarm: Array<{ bit: number; label: string }>; statuses: Record<string, string> };

function logClass(level: string): string {
  if (level === 'rx') return 'log-rx';
  if (level === 'tx') return 'log-tx';
  if (level === 'state') return 'log-state';
  if (level === 'error') return 'log-error';
  return '';
}

function appendLog(entry: LogEntry): void {
  const line = document.createElement('div');
  line.className = `log-line ${logClass(entry.level)}`;
  line.textContent = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
  logView.appendChild(line);
  logView.scrollTop = logView.scrollHeight;
}

async function loadLogs(): Promise<void> {
  const logs = await window.api.getLogs();
  logView.innerHTML = '';
  logs.forEach(appendLog);
}

function renderPorts(ports: PortInfo[]): void {
  portSelect.innerHTML = '';
  ports.forEach((port) => {
    const option = document.createElement('option');
    option.value = port.path;
    option.text = `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}`;
    portSelect.appendChild(option);
  });

  if (ports.length > 0) {
    portDebug.textContent = `Detected ${ports.length} port(s): ${ports.map((port) => port.path).join(', ')}`;
    const preferred = ports.find((port) => port.path.toUpperCase() === portInput.value.toUpperCase());
    if (preferred) {
      portSelect.value = preferred.path;
      portInput.value = preferred.path;
    } else {
      portInput.value = ports[0].path;
      portSelect.value = ports[0].path;
    }
  } else {
    portDebug.textContent = 'No ports detected from SerialPort.list(). You can still type COM port manually (e.g., COM3).';
  }
}

async function refreshPortList(): Promise<void> {
  const ports = await window.api.listPorts();
  renderPorts(ports);
}

function renderRegisters(state: UiState): void {
  const rows = Object.keys(state.registers)
    .sort()
    .map((key) => `${key}: ${state.registers[key]} (0x${state.registers[key].toString(16).toUpperCase().padStart(4, '0')})`);
  registerView.textContent = rows.join('\n');
}

function parseSelectedBits(container: HTMLElement): number[] {
  const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')) as HTMLInputElement[];
  return checked.map((el) => Number(el.value));
}

function renderBitOptions(container: HTMLElement, type: 'fault1' | 'fault2' | 'alarm', defs: Array<{ bit: number; label: string }>): void {
  container.innerHTML = '';

  defs.forEach((def) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = `${def.bit}`;
    checkbox.addEventListener('change', async () => {
      await window.api.setBitfield(type, parseSelectedBits(container));
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(`Bit ${def.bit}: ${def.label}`));
    container.appendChild(label);
  });
}

function syncBitSelectionFromState(state: UiState): void {
  const fault1 = state.registers['0x0282'] ?? 0;
  const fault2 = state.registers['0x0283'] ?? 0;
  const alarm = state.registers['0x0286'] ?? 0;

  const apply = (container: HTMLElement, value: number) => {
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    checkboxes.forEach((cb) => {
      const bit = Number(cb.value);
      cb.checked = ((value >> bit) & 1) === 1;
    });
  };

  apply(fault1Bits, fault1);
  apply(fault2Bits, fault2);
  apply(alarmBits, alarm);
}

function renderStatusOptions(statuses: Record<string, string>): void {
  statusSelect.innerHTML = '';
  Object.entries(statuses)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.text = `${value}: ${label}`;
      statusSelect.appendChild(option);
    });
}

function renderDelays(state: UiState): void {
  const labels = [
    'Idle→Reversing',
    'Reversing→Parked',
    'Parked→Foam',
    'Foam→High Pressure',
    'High Pressure→Snow Foam',
    'Snow Foam→Coating Wax',
    'Coating Wax→1st Dry',
    '1st Dry→Complete',
    'Complete→Idle'
  ];

  const existingInputs = Array.from(delayContainer.querySelectorAll('input[type="number"]')) as HTMLInputElement[];

  if (existingInputs.length === state.delays.length) {
    state.delays.forEach((delay, index) => {
      const input = existingInputs[index];
      if (document.activeElement !== input) {
        input.value = `${delay}`;
      }
    });
    return;
  }

  delayContainer.innerHTML = '';

  state.delays.forEach((delay, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'delay-grid';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = `${delay}`;
    input.min = '0';

    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = labels[index] ?? `Step ${index}`;
    button.addEventListener('click', async () => {
      await window.api.setDelay(index, Number(input.value));
    });

    wrapper.appendChild(input);
    wrapper.appendChild(button);
    delayContainer.appendChild(wrapper);
  });
}

function renderState(state: UiState): void {
  latestState = state;
  connectionStatus.textContent = state.connected ? `Connected: ${state.portPath}` : 'Disconnected';
  simBadge.textContent = state.simulationRunning ? 'Simulation: running' : 'Simulation: stopped';

  const currentStatus = state.registers['0x028A'];
  if (currentStatus !== undefined) {
    statusSelect.value = String(currentStatus);
  }

  renderRegisters(state);
  renderDelays(state);
  syncBitSelectionFromState(state);
}

async function boot(): Promise<void> {
  bitDefs = await window.api.getBitDefinitions();
  renderStatusOptions(bitDefs.statuses);
  renderBitOptions(fault1Bits, 'fault1', bitDefs.fault1);
  renderBitOptions(fault2Bits, 'fault2', bitDefs.fault2);
  renderBitOptions(alarmBits, 'alarm', bitDefs.alarm);

  await refreshPortList();
  await loadLogs();

  const state = await window.api.getState();
  renderState(state);

  window.api.onLog((entry) => appendLog(entry));
  window.api.onState((nextState) => renderState(nextState));
}

refreshPorts.addEventListener('click', () => {
  refreshPortList();
});

testAlertBtn.addEventListener('click', () => {
  const now = new Date().toISOString();
  appendLog({
    timestamp: now,
    level: 'info',
    message: 'Test Alert button clicked'
  });
  alert(`UI script is active.\n${now}`);
});

portSelect.addEventListener('change', () => {
  if (portSelect.value) {
    portInput.value = portSelect.value;
  }
});

connectBtn.addEventListener('click', async () => {
  const selectedPath = (portInput.value || portSelect.value || '').trim();
  if (!selectedPath) {
    appendLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Port is empty. Enter COM port manually (e.g., COM3).'
    });
    return;
  }

  connectionStatus.textContent = `Connecting: ${selectedPath} ...`;
  connectBtn.disabled = true;
  disconnectBtn.disabled = true;
  try {
    const connectPromise = window.api.connect({
      path: selectedPath,
      baudRate: Number(baudRate.value) || 9600,
      slaveId: Number(slaveId.value) || 1
    });
    await withTimeout(connectPromise, 5000, `Connect timeout after 5s (${selectedPath})`);
    alert(`Connected: ${selectedPath}`);
  } catch (error) {
    const message = (error as Error).message;
    appendLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Connect failed (${selectedPath}): ${message}`
    });
    connectionStatus.textContent = `Connect failed: ${message}`;
    alert(`Connect failed (${selectedPath})\n${message}`);
  } finally {
    connectBtn.disabled = false;
    disconnectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', async () => {
  disconnectBtn.disabled = true;
  connectBtn.disabled = true;
  try {
    await withTimeout(window.api.disconnect(), 5000, 'Disconnect timeout after 5s');
    alert('Disconnected');
  } catch (error) {
    appendLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Disconnect failed: ${(error as Error).message}`
    });
    alert(`Disconnect failed\n${(error as Error).message}`);
  } finally {
    disconnectBtn.disabled = false;
    connectBtn.disabled = false;
  }
});

setStatusBtn.addEventListener('click', async () => {
  await window.api.setStatus(Number(statusSelect.value));
});

forceFaultBtn.addEventListener('click', async () => {
  await window.api.forceFault();
});

clearFaultBtn.addEventListener('click', async () => {
  await window.api.clearFaults();
});

clearLogsBtn.addEventListener('click', async () => {
  await window.api.clearLogs();
  await loadLogs();
});

boot().catch((error) => {
  appendLog({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `UI boot failed: ${(error as Error).message}`
  });
});

window.addEventListener('error', (event) => {
  appendLog({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `Window error: ${event.message}`
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  appendLog({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `Unhandled promise rejection: ${reason}`
  });
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
