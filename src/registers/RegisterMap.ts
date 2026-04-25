export const REG_START = 0x0280;
export const REG_STOP = 0x0281;
export const REG_HOME_OR_FAULT1 = 0x0282;
export const REG_RISE_OR_FAULT2 = 0x0283;
export const REG_ALARM = 0x0286;
export const REG_MACHINE_STATUS = 0x028a;

export const machineStatusLabel: Record<number, string> = {
  1: 'Idle',
  2: 'Reversing',
  3: 'Parked',
  4: 'Foam',
  5: 'High Pressure',
  6: 'Snow Foam',
  7: 'Coating Wax',
  8: '1st Dry',
  9: 'Fault',
  10: 'Complete'
};

export const FAULT1_BITS: Array<{ bit: number; label: string }> = [
  { bit: 0, label: 'Machine not at home position' },
  { bit: 2, label: 'Emergency stop pressed' },
  { bit: 3, label: 'Travel overload' },
  { bit: 4, label: 'Lift overload' },
  { bit: 6, label: 'High pressure overload' },
  { bit: 7, label: 'Lift encoder error' },
  { bit: 8, label: 'Rotation encoder error' },
  { bit: 9, label: 'Water pump overload' },
  { bit: 10, label: 'Rotation overload' },
  { bit: 11, label: 'Side dryer overload' },
  { bit: 12, label: 'Top dryer overload' },
  { bit: 14, label: 'Sequential alarm' }
];

export const FAULT2_BITS: Array<{ bit: number; label: string }> = [
  { bit: 3, label: 'Magnetic ring protection 1' },
  { bit: 4, label: 'Magnetic ring protection 2' },
  { bit: 5, label: 'Top nozzle not at home' },
  { bit: 6, label: 'Rotation not at home' },
  { bit: 9, label: 'Left anti-collision alarm' },
  { bit: 10, label: 'Right anti-collision alarm' },
  { bit: 12, label: 'Wash operation timeout' },
  { bit: 15, label: 'Remote wash maintenance' }
];

export const ALARM_BITS: Array<{ bit: number; label: string }> = [
  { bit: 0, label: 'XP1 foam detergent alarm' },
  { bit: 1, label: 'Wax detergent alarm' },
  { bit: 9, label: 'XP2 foam detergent alarm' },
  { bit: 10, label: 'XP3 foam detergent alarm' }
];

export class RegisterMap {
  private readonly registers = new Map<number, number>();

  public constructor() {
    this.reset();
  }

  public reset(): void {
    this.registers.set(REG_START, 0);
    this.registers.set(REG_STOP, 0);
    this.registers.set(REG_HOME_OR_FAULT1, 0);
    this.registers.set(REG_RISE_OR_FAULT2, 0);
    this.registers.set(REG_ALARM, 0);
    this.registers.set(REG_MACHINE_STATUS, 1);
  }

  public readHolding(startAddress: number, quantity: number): number[] {
    const values: number[] = [];
    for (let i = 0; i < quantity; i += 1) {
      values.push(this.readRegister(startAddress + i));
    }
    return values;
  }

  public readRegister(address: number): number {
    return this.registers.get(address) ?? 0;
  }

  public writeRegister(address: number, value: number): void {
    this.registers.set(address, value & 0xffff);
  }

  public snapshot(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [address, value] of this.registers.entries()) {
      result[`0x${address.toString(16).toUpperCase().padStart(4, '0')}`] = value;
    }
    return result;
  }
}
