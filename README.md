# Fake Car Wash Machine Slave (Electron Demo)

노트북에서 실행하는 **세차기 대체용 RS-485 Modbus RTU Slave** 데스크톱 앱입니다.
키오스크 앱이 Master, 본 앱이 Slave(기본 ID: 0x01) 역할을 수행합니다.

## 기술 스택

- Node.js
- TypeScript
- Electron
- serialport
- Windows/macOS 지원 대상

## 주요 기능

- Serial 포트 조회, 선택, 연결/해제
- Modbus RTU Slave 엔진
  - FC `0x03` Read Holding Registers
  - FC `0x06` Write Single Register
  - CRC16(Modbus RTU) 검증
  - Slave ID mismatch / CRC 오류 무응답
  - 미지원 FC Exception Response
- 세차 시뮬레이션 시퀀스 자동 진행
- Stop/Home/Rise 처리
- Fault/Alarm bitfield 강제 설정 + Clear Faults
- Machine Status 수동 변경
- RX/TX HEX 및 파싱/상태/오류 로그

## 레지스터 맵

### Write Single Register

- `0x0280`: Start (1~6)
- `0x0281`: Stop (1)
- `0x0282`: Home (1)
- `0x0283`: Rise (1)

### Read Holding Registers

- `0x028A`: Machine Status (1~10)
- `0x0282`: Fault Code 1 (bitfield)
- `0x0283`: Fault Code 2 (bitfield)
- `0x0286`: Alarm Code (bitfield)

## 빠른 실행

```bash
npm install
npm start
```

### Windows 포트가 목록에 안 뜰 때

- 장치관리자에서 `USB Serial Port (COMx)`가 보이면, 앱에서 **Port (Manual override)** 에 `COMx`를 직접 입력 후 Connect를 시도하세요.
- 포트 조회는 `SerialPort.list()` 결과에 의존하므로, 일부 환경에서 자동 감지가 누락될 수 있습니다.
- Connect 실패 시 우측 로그에 `Connect failed (COMx): ...` 메시지가 표시됩니다. (포트 점유/권한/잘못된 포트명 확인)
- Connect/Disconnect 동작 시 성공/실패 결과가 팝업(alert)으로도 표시됩니다.
- Connect/Disconnect가 5초 이상 응답이 없으면 timeout 실패 팝업을 표시합니다.
- UI가 최신 코드로 실행 중인지 확인하려면 **Test Alert** 버튼을 눌러 즉시 팝업/로그가 뜨는지 확인하세요.
- Test Alert 클릭 시 팝업이 전혀 없으면 renderer 번들 로딩 전 단계 문제일 수 있습니다. 이 경우 `connectionStatus`가 `HTML inline handler fired ...`로 바뀌는지 먼저 확인하세요.

- 기본 통신 설정:
  - Baudrate: 9600
  - Data bits: 8
  - Parity: None
  - Stop bits: 1
  - Slave ID: 1

## 빌드

```bash
npm run build
```

## 테스트 프레임 예시

- Start Type 1 요청
  - RX: `01 06 02 80 00 01 48 5A`
  - TX: 동일 echo 응답

- Status Read 요청
  - RX: `01 03 02 8A 00 01 A4 58`
  - TX: `01 03 02 00 01 ...CRC...`

> CRC는 요청/응답마다 코드에서 실시간 계산됩니다.

## 프로젝트 구조

- `src/main/main.ts` : Electron main process + IPC + slave/simulation wiring
- `src/preload/preload.ts` : Renderer API 브릿지
- `src/renderer/index.html` : UI
- `src/renderer/renderer.ts` : UI 로직
- `src/modbus/ModbusRtuSlave.ts` : RTU slave 엔진
- `src/modbus/ModbusCrc.ts` : CRC16 계산/검증
- `src/registers/RegisterMap.ts` : 레지스터 맵
- `src/simulation/WashSimulationEngine.ts` : 상태 시퀀스 엔진
