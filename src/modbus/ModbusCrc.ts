export class ModbusCrc {
  public static calculate(frame: Buffer): number {
    let crc = 0xffff;

    for (const byte of frame) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        const lsb = crc & 0x0001;
        crc >>= 1;
        if (lsb) {
          crc ^= 0xa001;
        }
      }
    }

    return crc & 0xffff;
  }

  public static append(frameWithoutCrc: Buffer): Buffer {
    const crc = ModbusCrc.calculate(frameWithoutCrc);
    const low = crc & 0xff;
    const high = (crc >> 8) & 0xff;
    return Buffer.concat([frameWithoutCrc, Buffer.from([low, high])]);
  }

  public static isValid(frameWithCrc: Buffer): boolean {
    if (frameWithCrc.length < 4) {
      return false;
    }

    const payload = frameWithCrc.subarray(0, frameWithCrc.length - 2);
    const receivedLow = frameWithCrc[frameWithCrc.length - 2];
    const receivedHigh = frameWithCrc[frameWithCrc.length - 1];
    const calculated = ModbusCrc.calculate(payload);

    return receivedLow === (calculated & 0xff) && receivedHigh === ((calculated >> 8) & 0xff);
  }
}
