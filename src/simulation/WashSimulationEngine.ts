import { machineStatusLabel, REG_MACHINE_STATUS } from '../registers/RegisterMap';

interface RegisterWriter {
  setStatus(status: number): void;
}

interface Logger {
  (message: string): void;
}

const DEFAULT_SEQUENCE = [2, 3, 4, 5, 6, 7, 8, 10, 1];

export class WashSimulationEngine {
  private readonly delaysMs: number[] = [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200];

  private currentTimer: NodeJS.Timeout | null = null;

  private running = false;

  public constructor(private readonly registerWriter: RegisterWriter, private readonly logger: Logger) {}

  public getDelays(): number[] {
    return [...this.delaysMs];
  }

  public updateDelay(index: number, delayMs: number): void {
    if (index < 0 || index >= this.delaysMs.length) {
      return;
    }
    this.delaysMs[index] = Math.max(0, Math.floor(delayMs));
  }

  public isRunning(): boolean {
    return this.running;
  }

  public start(programType: number): void {
    this.stop(false);
    this.running = true;
    this.logger(`Wash start requested: Type ${programType}`);
    this.step(0);
  }

  public stop(forceIdle = true): void {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    const wasRunning = this.running;
    this.running = false;

    if (forceIdle) {
      this.registerWriter.setStatus(1);
    }

    if (wasRunning || forceIdle) {
      this.logger('Wash simulation stopped; status set to Idle');
    }
  }

  private step(index: number): void {
    if (!this.running) {
      return;
    }

    const status = DEFAULT_SEQUENCE[index];
    this.registerWriter.setStatus(status);
    this.logger(`Status changed to ${machineStatusLabel[status] ?? `Unknown(${status})`} (${status}) @ 0x${REG_MACHINE_STATUS.toString(16)}`);

    if (index >= DEFAULT_SEQUENCE.length - 1) {
      this.running = false;
      this.logger('Wash simulation completed');
      return;
    }

    const delay = this.delaysMs[index] ?? 1000;
    this.currentTimer = setTimeout(() => this.step(index + 1), delay);
  }
}
