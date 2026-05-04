import { SerialPort } from 'serialport';
import { ModbusCrc } from './ModbusCrc';
import {
  REG_ALARM,
  REG_HOME_OR_FAULT1,
  REG_MACHINE_STATUS,
  REG_RISE_OR_FAULT2,
  REG_START,
  REG_STOP,
  RegisterMap,
  machineStatusLabel
} from '../registers/RegisterMap';

interface ModbusEvents {
  onLog: (level: 'info' | 'rx' | 'tx' | 'state' | 'error', message: string) => void;
  onStateChanged: () => void;
  onWriteStart: (programType: number) => void;
  onStop: () => void;
  onHome: () => void;
  onRise: () => void;
}

const FC_READ_HOLDING = 0x03;
const FC_WRITE_SINGLE = 0x06;
const STREAM_LOG_INTERVAL_MS = 1000;

export class ModbusRtuSlave {
  private port: SerialPort | null = null;

  private buffer = Buffer.alloc(0);

  private lastPartialFrameLogAt = 0;

  private lastResyncLogAt = 0;

  public constructor(private readonly registers: RegisterMap, private readonly events: ModbusEvents) {}

  public async open(path: string, baudRate: number): Promise<void> {
    await this.close();

    this.port = new SerialPort({
      path,
      baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    });

    this.port.on('data', (chunk) => this.onData(chunk));
    this.port.on('error', (error) => {
      this.events.onLog('error', `Serial port error: ${error.message}`);
    });

    await new Promise<void>((resolve, reject) => {
      this.port?.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.events.onLog('info', `Serial opened: ${path} @ ${baudRate}`);
  }

  public async close(): Promise<void> {
    if (!this.port) {
      return;
    }

    const portToClose = this.port;
    this.port = null;

    await new Promise<void>((resolve) => {
      portToClose.close(() => resolve());
    });

    this.buffer = Buffer.alloc(0);
    this.events.onLog('info', 'Serial closed');
  }

  public isOpen(): boolean {
    return !!this.port?.isOpen;
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.processBufferedFrames();
  }

  private processBufferedFrames(): void {
    const requestLength = 8;

    while (this.buffer.length >= requestLength) {
      const frame = this.buffer.subarray(0, requestLength);

      if (!ModbusCrc.isValid(frame)) {
        this.logWithInterval('resync', 'error', `Discarding byte while seeking valid frame boundary: ${toHex(frame.subarray(0, 1))}`);
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      this.buffer = this.buffer.subarray(requestLength);
      this.processFrame(frame);
    }

    if (this.buffer.length > 0 && this.buffer.length < requestLength) {
      this.logWithInterval('partial', 'info', `Waiting for more data to complete frame: ${toHex(this.buffer)}`);
    }
  }

  private logWithInterval(kind: 'partial' | 'resync', level: 'info' | 'error', message: string): void {
    const now = Date.now();
    const lastLogAt = kind === 'partial' ? this.lastPartialFrameLogAt : this.lastResyncLogAt;

    if (now - lastLogAt < STREAM_LOG_INTERVAL_MS) {
      return;
    }

    if (kind === 'partial') {
      this.lastPartialFrameLogAt = now;
    } else {
      this.lastResyncLogAt = now;
    }

    this.events.onLog(level, message);
  }

  private processFrame(frame: Buffer): void {
    if (frame.length < 8) {
      this.events.onLog('error', `Frame too short: ${toHex(frame)}`);
      return;
    }

    this.events.onLog('rx', toHex(frame));

    if (!ModbusCrc.isValid(frame)) {
      this.events.onLog('error', `CRC invalid; ignoring frame: ${toHex(frame)}`);
      return;
    }

    const slaveId = frame[0];
    const fc = frame[1];
    const address = frame.readUInt16BE(2);
    const valueOrQuantity = frame.readUInt16BE(4);

    this.events.onLog('info', `Incoming request parsed: slave=${slaveId}, fc=0x${fc.toString(16).padStart(2, '0')}, addr=0x${address.toString(16).padStart(4, '0')}, value/qty=${valueOrQuantity}`);

    if (slaveId !== this.currentSlaveId) {
      return;
    }

    if (fc === FC_READ_HOLDING) {
      this.handleReadHolding(slaveId, address, valueOrQuantity);
      return;
    }

    if (fc === FC_WRITE_SINGLE) {
      this.handleWriteSingle(frame, slaveId, address, valueOrQuantity);
      return;
    }

    this.writeException(slaveId, fc, 0x01);
  }

  private get currentSlaveId(): number {
    return this._slaveId;
  }

  private _slaveId = 0x01;

  public setSlaveId(id: number): void {
    this._slaveId = id & 0xff;
    this.events.onLog('info', `Slave ID set to ${this._slaveId}`);
  }

  private handleReadHolding(slaveId: number, startAddress: number, quantity: number): void {
    if (quantity < 1 || quantity > 125) {
      this.writeException(slaveId, FC_READ_HOLDING, 0x03);
      return;
    }

    const values = this.registers.readHolding(startAddress, quantity);
    const byteCount = quantity * 2;
    const body = Buffer.alloc(3 + byteCount);
    body[0] = slaveId;
    body[1] = FC_READ_HOLDING;
    body[2] = byteCount;

    values.forEach((value, index) => {
      body.writeUInt16BE(value & 0xffff, 3 + index * 2);
    });

    const response = ModbusCrc.append(body);
    this.events.onLog('info', `Outgoing read response: start=0x${startAddress.toString(16).padStart(4, '0')}, qty=${quantity}, values=[${values.map((value) => `0x${value.toString(16).padStart(4, '0')}`).join(', ')}]`);
    this.write(response);
  }

  private handleWriteSingle(requestFrame: Buffer, slaveId: number, address: number, value: number): void {
    this.registers.writeRegister(address, value);

    if (address === REG_START && value >= 1 && value <= 6) {
      this.events.onWriteStart(value);
    } else if (address === REG_STOP && value === 1) {
      this.events.onStop();
    } else if (address === REG_HOME_OR_FAULT1 && value === 1) {
      this.events.onHome();
    } else if (address === REG_RISE_OR_FAULT2 && value === 1) {
      this.events.onRise();
    }

    this.events.onStateChanged();

    const body = Buffer.alloc(6);
    body[0] = slaveId;
    body[1] = FC_WRITE_SINGLE;
    body.writeUInt16BE(address, 2);
    body.writeUInt16BE(value, 4);
    const response = ModbusCrc.append(body);
    this.events.onLog(
      'info',
      `[WRITE] RX=${toHex(requestFrame)} TX=${toHex(response)} addr=0x${address.toString(16).padStart(4, '0')} value=0x${value.toString(16).padStart(4, '0')} (${value})`
    );
    this.write(response);

    if (address === REG_MACHINE_STATUS) {
      this.events.onLog('state', `Machine status changed to ${machineStatusLabel[value] ?? `Unknown(${value})`}`);
    }
    if (address === REG_HOME_OR_FAULT1 && value === 1) {
      this.events.onLog('state', 'Home command received');
    }
    if (address === REG_RISE_OR_FAULT2 && value === 1) {
      this.events.onLog('state', 'Rise command received');
    }
    if (address === REG_STOP && value === 1) {
      this.events.onLog('state', 'Stop command received');
    }
    if (address === REG_START && value >= 1 && value <= 6) {
      this.events.onLog('state', `Start command received: Type ${value}`);
    }
    if (address === REG_ALARM) {
      this.events.onLog('state', `Alarm register updated to 0x${value.toString(16).padStart(4, '0')}`);
    }
  }

  private writeException(slaveId: number, fc: number, exceptionCode: number): void {
    const body = Buffer.from([slaveId, fc | 0x80, exceptionCode]);
    const response = ModbusCrc.append(body);
    this.write(response);
    this.events.onLog('error', `Exception response sent: fc=0x${fc.toString(16)}, ex=0x${exceptionCode.toString(16)}`);
  }

  private write(frame: Buffer): void {
    if (!this.port?.isOpen) {
      return;
    }

    this.port.write(frame);
    this.events.onLog('tx', toHex(frame));
  }
}

function toHex(buffer: Buffer): string {
  return buffer.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') ?? '';
}
