// src/platform/logicBlocks.js
// Shrimprium logicBlocks 이식본 — 수질 블록 제거
// 로직 블록(피스톤·repeater)의 매 프레임 상태 갱신 헬퍼.

import {
  PLATFORM_W,
  PLATFORM_H,
  getPistonFaceDir,
  getPlatformYRange,
  getBlockPorts,
  SENSOR_METRICS,
  isLogicLayerBlock,
} from "./platformBlockRenderer.js";

/** Repeater 신호 지연 (ms). */
export const REPEATER_DELAY_MS = 500;

/** Timer 블록 ON/OFF 주기 (ms). */
export const TIMER_PERIOD_MS = 1000;

/**
 * Timer 블록 자동 발진: 외부 신호 없이 TIMER_PERIOD_MS 주기로 ON/OFF 반복.
 * @param {Array<object>} platforms
 * @param {number} now - performance.now() ms 타임스탬프
 */
export function tickTimers(platforms, now) {
  if (!Array.isArray(platforms)) return;
  for (const p of platforms) {
    if (p.blockType !== "timer_block") continue;
    const ts = p.timerState ?? (p.timerState = { outputOn: false, nextFlipAt: now + TIMER_PERIOD_MS });
    // 저장/복원으로 인해 performance.now() 기준이 리셋되면 nextFlipAt이 미래의
    // 비현실적 값으로 남을 수 있다. 다음 주기보다 멀리 있으면 재스케줄.
    if (ts.nextFlipAt > now + TIMER_PERIOD_MS) {
      ts.nextFlipAt = now + TIMER_PERIOD_MS;
      continue;
    }
    if (now >= ts.nextFlipAt) {
      ts.outputOn = !ts.outputOn;
      ts.nextFlipAt = now + TIMER_PERIOD_MS;
    }
  }
}

/**
 * Repeater 타이머 진행: 입력과 출력이 다르면 지연 후 출력 갱신.
 * 각 repeater의 state는 in-place 갱신.
 * @param {Array<object>} platforms
 * @param {Map<number, boolean>} repeaterInputs - id → 입력 ON 여부
 * @param {number} now - performance.now() ms 타임스탬프
 * @param {number} [delayMs=REPEATER_DELAY_MS] - 지연 시간 (테스트용 주입 가능)
 */
export function tickRepeaters(platforms, repeaterInputs, now, delayMs = REPEATER_DELAY_MS) {
  if (!Array.isArray(platforms) || !repeaterInputs) return;
  for (const p of platforms) {
    if (p.blockType !== "repeater_block") continue;
    const rs = p.repeaterState ?? (p.repeaterState = { outputOn: false, pendingTargetOn: null, pendingChangeAt: null });
    const inputOn = !!repeaterInputs.get(p.id);
    if (inputOn === rs.outputOn) {
      rs.pendingTargetOn = null;
      rs.pendingChangeAt = null;
      continue;
    }
    if (rs.pendingTargetOn !== inputOn) {
      rs.pendingTargetOn = inputOn;
      rs.pendingChangeAt = now + delayMs;
    }
    if (rs.pendingChangeAt != null && now >= rs.pendingChangeAt) {
      rs.outputOn = rs.pendingTargetOn;
      rs.pendingTargetOn = null;
      rs.pendingChangeAt = null;
    }
  }
}

/**
 * 논리 게이트 종류 → 출력 계산 함수. 입력 배열(boolean[])을 받아 출력 ON 여부 반환.
 * - AND: 두 입력이 모두 ON.
 * - OR: 두 입력 중 하나라도 ON.
 * - NAND: AND의 반전 (입력 없으면 true → 기본 ON).
 * - NOR: OR의 반전 (입력 없으면 true → 기본 ON).
 * - XOR: 두 입력이 서로 다름.
 * - NOT: 단일 입력의 반전 (입력 없으면 true → 기본 ON).
 * - diode(트랜지스터형): 단일 입력을 반전 없이 그대로 출력 (역방향 전파 없음).
 */
const GATE_FUNCS = {
  and_gate_block:  (i) => !!i[0] && !!i[1],
  or_gate_block:   (i) => !!i[0] || !!i[1],
  nand_gate_block: (i) => !(i[0] && i[1]),
  nor_gate_block:  (i) => !(i[0] || i[1]),
  xor_gate_block:  (i) => !!i[0] !== !!i[1],
  not_gate_block:  (i) => !i[0],
  diode_block:     (i) => !!i[0],
};

/**
 * 논리 게이트 출력 갱신: 입력 조합을 즉시 gateState.outputOn에 반영(지연 없음).
 * computeBlockSignals가 게이트 출력을 직전 프레임 gateState로 발산하므로, 게이트가
 * 연쇄돼도 단계마다 1프레임씩 전파되어 피드백 루프가 발산하지 않는다.
 * @param {Array<object>} platforms
 * @param {Map<number, boolean[]>} gateInputs - id → 입력 포트별 ON 배열
 */
export function tickGates(platforms, gateInputs) {
  if (!Array.isArray(platforms) || !gateInputs) return;
  for (const p of platforms) {
    const fn = GATE_FUNCS[p.blockType];
    if (!fn) continue;
    const gs = p.gateState ?? (p.gateState = { outputOn: false });
    gs.outputOn = fn(gateInputs.get(p.id) ?? []);
  }
}

/**
 * 센서 블록 출력 갱신: 수조 상태값(readings)을 임계값과 비교해 outputOn 설정.
 * 신호 소스(타이머와 동일)이므로 즉시 반영하면 된다.
 * readings에 해당 값이 없거나 숫자가 아니면 OFF로 둔다(방문 모드 등에서 안전).
 * @param {Array<object>} platforms
 * @param {{vampireCount?:number}} readings - 지표 키 → 현재 값
 */
export function tickSensors(platforms, readings) {
  if (!Array.isArray(platforms) || !readings) return;
  for (const p of platforms) {
    const cfg = SENSOR_METRICS[p.blockType];
    if (!cfg) continue;
    const ss = p.sensorState ?? (p.sensorState = {
      op: cfg.defOp, threshold: cfg.defThreshold, outputOn: false,
    });
    const v = Number(readings[cfg.reading]);
    if (!Number.isFinite(v)) { ss.outputOn = false; continue; }
    ss.outputOn = ss.op === "lte" ? v <= ss.threshold : v >= ss.threshold;
  }
}

/**
 * 피스톤이 밀 수 없는 블록 종류. face 셀이 이 종류면 push 전체 실패.
 * 스위치는 미는 대신 누르는(press) 대상이므로 여기에 포함된다 — 회로 자기유지·깜빡 동작
 * 동안 피스톤이 스위치 옆에 계속 붙어 있어야 press 효과가 유지된다.
 */
const NOT_PUSHABLE = new Set([
  "piston_block",
  "black_hole_block",
  "white_hole_block",
  "recall_block",
  "switch_block",
  "switch_nc_block",
  "timer_block",
  ...Object.keys(SENSOR_METRICS), // 센서도 위치 고정 소스 — 밀리지 않음
]);

/** 체인 push 최대 길이 (안전 한계, 수조 가로 16칸/세로 17칸 + 여유) */
const MAX_CHAIN = 20;

/**
 * 피스톤 push/retract 실행.
 * powered이고 비-확장 상태면 face 방향으로 체인을 탐지해 첫 블록만 끝(빈/통과가능 칸)으로 이동.
 * unpowered이고 확장 상태면 pushedBlockId를 face 칸으로 복귀시킨다.
 * "동일 체인" 정의: 동일 (blockType, rotation). face 셀이 NOT_PUSHABLE이면 즉시 실패.
 * 논리 레이어 블록(배선·게이트 등)은 별도 평면에 있어 밀리지도, 길을 막지도 않는다.
 * @param {Array<object>} platforms
 * @param {Map<number, boolean>} blockPowered - 이번 프레임 신호 그래프 결과
 * @param {{minY:number, maxY:number, tankW?:number}} [bounds]
 */
export function tickPistons(platforms, blockPowered, bounds) {
  if (!Array.isArray(platforms) || !blockPowered) return;
  const { minY, maxY } = bounds ?? getPlatformYRange(640);
  const tankW = bounds?.tankW ?? 320;
  const DELTA = {
    up:    { dx: 0,            dy: -PLATFORM_H },
    down:  { dx: 0,            dy:  PLATFORM_H },
    left:  { dx: -PLATFORM_W,  dy: 0 },
    right: { dx:  PLATFORM_W,  dy: 0 },
  };
  // 피스톤은 플랫폼/기능 레이어만 상대한다 — 논리 블록은 무시(통과).
  const blockAt = (x, y) => platforms.find((b) => !isLogicLayerBlock(b.blockType) && b.x === x && b.y === y);
  const isPassable = (b) => !b || (b.blockType === "gate_block" && blockPowered.get(b.id));
  const portsEqual = (a, b) => {
    if (a.size !== b.size) return false;
    for (const d of a) if (!b.has(d)) return false;
    return true;
  };

  for (const p of platforms) {
    if (p.blockType !== "piston_block") continue;
    const ps = p.pistonState ?? (p.pistonState = { pushedBlockId: null });
    const isPowered = !!blockPowered.get(p.id);
    // 다음 프레임 computeBlockSignals가 인접 스위치 press 판정에 사용한다 (1-프레임 피드백 끊기).
    ps.lastPowered = isPowered;
    const isExtended = ps.pushedBlockId != null;
    const face = getPistonFaceDir(p.rotation);
    const d = DELTA[face];

    if (isPowered && !isExtended) {
      const faceX = p.x + d.dx;
      const faceY = p.y + d.dy;
      const firstBlock = blockAt(faceX, faceY);
      // face 셀이 비었거나 통과 가능 → 밀 게 없음
      if (isPassable(firstBlock)) continue;
      // face 셀이 못 미는 블록(피스톤/블랙홀/화이트홀) → 실패
      if (NOT_PUSHABLE.has(firstBlock.blockType)) continue;

      // 체인 탐지: 동일 blockType + 동일 포트 집합인 블록이 face 방향으로 이어지다가
      // 빈 칸/통과가능 칸을 만나면 그게 체인 끝.
      // 포트 동등성 비교: cross 4방향, 가로 직선 0°==180°, 코너는 4회전 모두 구분 등 시각·기능
      // 동등 블록을 한 체인으로 묶기 위함.
      const chainType = firstBlock.blockType;
      const chainPorts = getBlockPorts(chainType, firstBlock.rotation);
      let cx = faceX, cy = faceY;
      let endX = null, endY = null;
      for (let i = 0; i < MAX_CHAIN + 1; i++) {
        if (cx < 0 || cx + PLATFORM_W > tankW || cy < minY || cy > maxY) break;
        const b = blockAt(cx, cy);
        if (isPassable(b)) { endX = cx; endY = cy; break; }
        if (b.blockType !== chainType) break;
        if (!portsEqual(getBlockPorts(b.blockType, b.rotation), chainPorts)) break;
        cx += d.dx;
        cy += d.dy;
      }
      if (endX == null) continue;

      // 첫 블록만 끝 칸으로 이동 (동일 블록이라 시각·기능 동등).
      // 절대 좌표를 기억해 둬서 piston이 이후 이동/회전되어도 정확히 원위치로 복귀 가능.
      ps.originalX = firstBlock.x;
      ps.originalY = firstBlock.y;
      firstBlock.x = endX;
      firstBlock.y = endY;
      ps.pushedBlockId = firstBlock.id;
    } else if (!isPowered && isExtended) {
      const target = platforms.find((b) => b.id === ps.pushedBlockId);
      if (target) {
        if (ps.originalX != null && ps.originalY != null) {
          target.x = ps.originalX;
          target.y = ps.originalY;
        } else {
          // 구버전 폴백: piston의 face 칸으로 복귀
          target.x = p.x + d.dx;
          target.y = p.y + d.dy;
        }
      }
      ps.pushedBlockId = null;
      ps.originalX = null;
      ps.originalY = null;
    }
  }
}
