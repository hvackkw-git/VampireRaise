// src/platform/platformBlockRenderer.js
// Shrimprium platformBlockRenderer 이식본 — 수질 관련 블록 제거, 캐릭터→캐릭터 일반화
// 플랫폼 블록 BMP 스프라이트 및 DOM 헬퍼

/** 플랫폼 블록 크기 (20×20 px, 320×640 수조 기준) */
export const PLATFORM_W = 20;
export const PLATFORM_H = 20;

/** 플랫폼 배치 이동 단위 (px) */
export const PLATFORM_STEP = 20;

/** 상점에서 한 번에 살 수 있는 최대 블록 수 */
export const PLATFORM_SHOP_MAX = 50;

/**
 * 지원하는 플랫폼 블록 타입 목록.
 * 기본 블록은 assets/equipment/{blockType}.bmp, 신규 블록은 assets/block/ PNG를 참조합니다.
 */
export const PLATFORM_BLOCK_TYPES = [
  "platform_block",
  // 심해 채석 테마 블록 (10종)
  "hongyeom_block",
  "simhong_block",
  "namcheong_block",
  "guncheong_block",
  "cheongnok_block",
  "simhae_block",
  "seori_block",
  "hoecheong_block",
  "jajeong_block",
  "borat_gyeol_block",
  // 별·우주 테마 블록 (6종, 디자인 전용)
  "seonggwang_block",
  "seongjwa_block",
  "seongun_block",
  "yuseong_block",
  "eunha_block",
  "wolgwang_block",
  // 신규 채색 테마 블록 (4종: 청록 2종 + 적토 2종)
  "cheongok_block",
  "cheonglam_block",
  "jeokto_block",
  "hwangjeok_block",
  // 숲·고대 유적 테마 블록 (디자인 전용)
  "forest_1_block",
  "forest_2_block",
  "forest_3_block",
  "ancient_1_block",
  "ancient_2_block",
  "ancient_3_block",
  // 기믹 블록: 워프/신호 시스템
  "black_hole_block",
  "white_hole_block",
  "switch_block",              // NO 스위치: 캐릭터 올라타면 ON
  "switch_nc_block",           // NC 스위치: 디폴트 ON, 캐릭터 올라타면 OFF
  "redstone_block",            // 십자 (cross): 4포트
  "redstone_straight_block",   // 직선 (ㅡ): 좌·우 2포트
  "redstone_corner_block",     // 꺾임 (ㄱ): 좌·하 2포트
  "redstone_bridge_block",     // 분리 십자 (끊어진 +): 상·하와 좌·우가 서로 분리된 채 교차
  "redstone_tee_block",        // T자 (ㅗ): 좌·우·하 3포트
  "lightbulb_block",
  // 로직 블록
  "piston_block",              // 단순 토글 push (face 방향 1칸)
  "gate_block",                // 투명화 게이트 (powered 시 충돌 비활성)
  "repeater_block",            // 지연 전파 (input→output)
  "and_gate_block",            // 논리곱: 두 입력(상·하)이 모두 ON일 때만 출력(우) ON
  "or_gate_block",             // 논리합: 두 입력(상·하) 중 하나만 ON이어도 출력(우) ON
  "nand_gate_block",           // NOT-AND: 두 입력이 모두 ON일 때만 출력 OFF (그 외 ON)
  "nor_gate_block",            // NOT-OR: 두 입력이 모두 OFF일 때만 출력 ON
  "xor_gate_block",            // 배타적논리합: 두 입력이 서로 다를 때만 출력 ON
  "not_gate_block",            // 부정: 입력(좌)을 반전해 출력(우) — 입력 없으면 ON
  "diode_block",               // 다이오드(트랜지스터형): 입력(좌)을 그대로 출력(우)으로, 역방향은 절대 통과 안 함
  "count_sensor_block",        // 마릿수 센서: 살아있는 캐릭터 수가 임계값 조건을 만족하면 출력 ON
  // 기능 블록
  "timer_block",               // 자동 신호 발진기 (1초 주기 ON/OFF)
  "spring_block",              // 스프링 블록 (캐릭터 접촉 시 위로 튕김)
  "spike_block",               // 가시 블록 (접촉 시 뒤집혀서 바닥으로 낙하)
  "conveyor_block",            // 컨베이어 블록 (신호 ON 시 캐릭터를 방향으로 밀기)
  "slide_block",               // 미끄럼 블록 (경사면에서 항상 아래 방향으로 미끄러짐)
  "recall_block",              // 리콜 블록 (게임시간 1분마다 랜덤 캐릭터 1마리를 끌어옴, 수조당 1개)
  "rgb_red_block",             // RGB 블록(빨강): 신호 ON 동안 화면 전체 빨강 틴트
  "rgb_green_block",           // RGB 블록(초록): 신호 ON 동안 화면 전체 초록 틴트
  "rgb_blue_block",            // RGB 블록(파랑): 신호 ON 동안 화면 전체 파랑 틴트
  "rgb_white_block",           // RGB 블록(하양): 신호 ON 동안 화면 전체 하양 틴트
  "stun_block",                // 스턴 블록 (밟히지 않음; 스치면 5초간 이동 정지·검정 틴트·자유낙하)
];

/** RGB 블록 종류 → 틴트 색상(rgb 트리플) */
export const RGB_BLOCK_TINTS = {
  rgb_red_block:   [255, 40, 40],
  rgb_green_block: [40, 220, 70],
  rgb_blue_block:  [50, 90, 255],
  rgb_white_block: [255, 255, 255],
};

/** 스위치 종류 (NO + NC). 신호 소스로 동일하게 동작, ON 조건만 반대. */
export const SWITCH_TYPES = new Set(["switch_block", "switch_nc_block"]);

/**
 * 센서 블록 메타데이터. 각 센서는 수조 상태값 하나를 임계값과 비교해 ON/OFF를
 * 출력하는 신호 소스(타이머와 동일 취급).
 * - reading: mountAquarium가 매 프레임 수집하는 readings 객체의 키.
 * - min/max/step: 꾸미기 모드 임계값 조절 범위.
 * - decimals/unit/icon: 조건 칩(예: "🌡️ ≥ 27.0°C") 표기.
 * - defOp/defThreshold: 배치 시 기본 조건.
 */
export const SENSOR_METRICS = {
  count_sensor_block: { reading: "vampireCount", min: 0, max: 50, step: 1, decimals: 0, unit: "", icon: "🧛", defOp: "gte", defThreshold: 5 },
};
/** 센서 블록 타입 집합 (신호 소스). */
export const SENSOR_TYPES = new Set(Object.keys(SENSOR_METRICS));

/** 레드스톤 종류: 신호 전파 대상 */
const REDSTONE_TYPES = new Set([
  "redstone_block",
  "redstone_straight_block",
  "redstone_corner_block",
  "redstone_bridge_block",
  "redstone_tee_block",
]);
/**
 * 논리 게이트 종류. 입력 포트의 신호를 조합해 출력 포트로 발산하는 능동 소스.
 * repeater처럼 자체 state(gateState.outputOn)를 가지며, 출력은 매 프레임 tickGates가
 * 직전 프레임 입력으로 계산한다(1프레임 지연 → 피드백 루프 안정화).
 */
const GATE_TYPES = new Set([
  "and_gate_block", "or_gate_block", "nand_gate_block", "nor_gate_block",
  "xor_gate_block", "not_gate_block", "diode_block",
]);
/** 능동 출력 블록(스위치 + outputOn repeater) 외 신호 전파 가능 종류 */
const ENDPOINT_TYPES = new Set([
  "lightbulb_block",
  "gate_block",
  "piston_block",
  "conveyor_block",
  "rgb_red_block",
  "rgb_green_block",
  "rgb_blue_block",
  "rgb_white_block",
]);

/** 짝이 자동 생성되는 블록(블랙홀): 인벤토리에서 직접 배치 가능 */
export const PAIRED_BLOCK_OWNER = "black_hole_block";
/** 짝으로 자동 생성되는 블록(화이트홀): 인벤토리 직접 보관 X, 짝 회수 시 함께 제거 */
export const PAIRED_BLOCK_PARTNER = "white_hole_block";

/**
 * 신규 블록 ID → assets/block/ 스프라이트 파일명 매핑.
 * 스위치/레드스톤/전구는 powered 상태에 따라 on/off 스프라이트가 분기됩니다.
 */
const NEW_BLOCK_SPRITE = {
  hongyeom_block:   "assets/block/newb_1.png",
  simhong_block:    "assets/block/newb_2.png",
  namcheong_block:  "assets/block/newb_3.png",
  guncheong_block:  "assets/block/newb_4.png",
  cheongnok_block:  "assets/block/newb_5.png",
  simhae_block:     "assets/block/newb_6.png",
  seori_block:      "assets/block/newb_7.png",
  hoecheong_block:  "assets/block/newb_8.png",
  jajeong_block:    "assets/block/newb_9.png",
  borat_gyeol_block:"assets/block/newb_10.png",
  seonggwang_block: "assets/block/newb_11.png",
  seongjwa_block:   "assets/block/newb_12.png",
  seongun_block:    "assets/block/newb_13.png",
  yuseong_block:    "assets/block/newb_14.png",
  eunha_block:      "assets/block/newb_15.png",
  wolgwang_block:   "assets/block/newb_16.png",
  cheongok_block:   "assets/block/newb_17.png",
  cheonglam_block:  "assets/block/newb_23.png",
  jeokto_block:     "assets/block/newb_22.png",
  hwangjeok_block:  "assets/block/newb_28.png",
  forest_1_block:   "assets/block/forest_1.png",
  forest_2_block:   "assets/block/forest_2.png",
  forest_3_block:   "assets/block/forest_3.png",
  ancient_1_block:  "assets/block/ancient_1.png",
  ancient_2_block:  "assets/block/ancient_2.png",
  ancient_3_block:  "assets/block/ancient_3.png",
  spike_block:      "assets/block/spike_block.png",
  slide_block:      "assets/block/slide_block.png",
  stun_block:       "assets/block/stun_block.png",
};

/** 컨베이어 ON 애니메이션 프레임 수 */
export const CONVEYOR_ANIM_FRAMES = 4;

/** 블랙홀/화이트홀 소용돌이 애니메이션 프레임 수 (항상 재생) */
export const HOLE_ANIM_FRAMES = 8;

/** 소용돌이 애니메이션 블록 ID → assets/block/ 프레임 파일 접두사 */
const HOLE_ANIM_SPRITE = {
  black_hole_block: "blackhole",
  white_hole_block: "whitehole",
  // 리콜 블록은 화이트홀 소용돌이 프레임을 재활용하고 푸른 틴트는 CSS로 입힌다.
  recall_block: "whitehole",
};

/** 2-상태(on/off) 블록의 스프라이트 매핑 */
const STATEFUL_BLOCK_SPRITE = {
  switch_block:             { on: "assets/block/switch_on.png",             off: "assets/block/switch_off.png" },
  switch_nc_block:          { on: "assets/block/switch_nc_on.png",          off: "assets/block/switch_nc_off.png" },
  redstone_block:           { on: "assets/block/redstone_on.png",           off: "assets/block/redstone_off.png" },
  redstone_straight_block:  { on: "assets/block/redstone_straight_on.png",  off: "assets/block/redstone_straight_off.png" },
  redstone_corner_block:    { on: "assets/block/redstone_corner_on.png",    off: "assets/block/redstone_corner_off.png" },
  redstone_tee_block:       { on: "assets/block/redstone_tee_on.png",       off: "assets/block/redstone_tee_off.png" },
  lightbulb_block:          { on: "assets/block/lightbulb_on.png",          off: "assets/block/lightbulb_off.png" },
  piston_block:             { on: "assets/block/piston_on.png",             off: "assets/block/piston_off.png" },
  gate_block:               { on: "assets/block/gate_on.png",               off: "assets/block/gate_off.png" },
  repeater_block:           { on: "assets/block/repeater_on.png",           off: "assets/block/repeater_off.png" },
  and_gate_block:           { on: "assets/block/and_gate_on.png",           off: "assets/block/and_gate_off.png" },
  or_gate_block:            { on: "assets/block/or_gate_on.png",            off: "assets/block/or_gate_off.png" },
  nand_gate_block:          { on: "assets/block/nand_gate_on.png",          off: "assets/block/nand_gate_off.png" },
  nor_gate_block:           { on: "assets/block/nor_gate_on.png",           off: "assets/block/nor_gate_off.png" },
  xor_gate_block:           { on: "assets/block/xor_gate_on.png",           off: "assets/block/xor_gate_off.png" },
  not_gate_block:           { on: "assets/block/not_gate_on.png",           off: "assets/block/not_gate_off.png" },
  diode_block:              { on: "assets/block/diode_on.png",              off: "assets/block/diode_off.png" },
  count_sensor_block:       { on: "assets/block/count_sensor_on.png",       off: "assets/block/count_sensor_off.png" },
  timer_block:              { on: "assets/block/timer_on.png",              off: "assets/block/timer_off.png" },
  spring_block:             { on: "assets/block/spring_on.png",             off: "assets/block/spring_off.png" },
  conveyor_block:           { on: "assets/block/conveyor_block_on_0.png",   off: "assets/block/conveyor_block_off.png" },
  rgb_red_block:            { on: "assets/block/rgb_red_on.png",            off: "assets/block/rgb_red_off.png" },
  rgb_green_block:          { on: "assets/block/rgb_green_on.png",          off: "assets/block/rgb_green_off.png" },
  rgb_blue_block:           { on: "assets/block/rgb_blue_on.png",           off: "assets/block/rgb_blue_off.png" },
  rgb_white_block:          { on: "assets/block/rgb_white_on.png",          off: "assets/block/rgb_white_off.png" },
};

/**
 * 분리 십자(redstone_bridge_block) 스프라이트. 상·하 그룹과 좌·우 그룹이 서로
 * 독립적으로 켜지므로 4개의 상태가 있습니다. powered 인자는 비트마스크로 해석:
 *   비트0(1) = 가로(left/right) 활성, 비트1(2) = 세로(up/down) 활성.
 */
const BRIDGE_SPRITE = {
  0:   "assets/block/redstone_bridge_off.png", // 둘 다 OFF
  1:   "assets/block/redstone_bridge_h.png",   // 가로만 ON
  2:   "assets/block/redstone_bridge_v.png",   // 세로만 ON
  3:   "assets/block/redstone_bridge_on.png",  // 둘 다 ON
};

/**
 * 숨김(투명화)모드로 드러난 배선용 스프라이트 — 진한 바탕 없이 빨간 선만 남긴다.
 * 신호가 켜져(stealthActive) 노출될 때만 쓰이므로 ON 형태 하나씩만 존재한다.
 * 분리 십자는 활성 방향(가로/세로)에 따라 스프라이트가 갈리므로 BRIDGE_STEALTH_SPRITE로 분리.
 */
const REDSTONE_STEALTH_SPRITE = {
  redstone_block:          "assets/block/redstone_stealth.png",
  redstone_straight_block: "assets/block/redstone_straight_stealth.png",
  redstone_corner_block:   "assets/block/redstone_corner_stealth.png",
  redstone_tee_block:      "assets/block/redstone_tee_stealth.png",
};
/** 분리 십자 숨김모드: 활성 방향 비트마스크(1=가로, 2=세로, 3=둘 다)별 배선 스프라이트. */
const BRIDGE_STEALTH_SPRITE = {
  1:   "assets/block/redstone_bridge_stealth_h.png",
  2:   "assets/block/redstone_bridge_stealth_v.png",
  3:   "assets/block/redstone_bridge_stealth_on.png",
};

/** 숨김(투명화)모드를 지원하는 블록: 레드스톤 배선 5종 + 블랙홀. */
export const STEALTH_BLOCK_TYPES = new Set([...REDSTONE_TYPES, "black_hole_block"]);

/**
 * 논리 레이어 블록 집합 (상점 '논리블록' 탭과 동일).
 * 수조는 2레이어 구조: 논리 레이어(배선·게이트·스위치 등)와 플랫폼 레이어(장식·기능 블록).
 * 서로 다른 레이어의 블록은 같은 칸에 겹쳐 배치할 수 있으며,
 * 렌더링 시 플랫폼/기능 블록이 항상 논리 블록보다 앞에 그려진다.
 */
export const LOGIC_LAYER_BLOCK_TYPES = new Set([
  "switch_block", "switch_nc_block",
  "redstone_block", "redstone_straight_block", "redstone_corner_block",
  "redstone_bridge_block", "redstone_tee_block",
  "lightbulb_block", "piston_block", "gate_block", "repeater_block",
  "and_gate_block", "or_gate_block", "nand_gate_block", "nor_gate_block",
  "xor_gate_block", "not_gate_block", "diode_block",
]);

/** 블록이 논리 레이어 소속인지 (아니면 플랫폼/기능 레이어) */
export function isLogicLayerBlock(blockType) {
  return LOGIC_LAYER_BLOCK_TYPES.has(String(blockType ?? ""));
}

/**
 * 플랫폼 블록 스프라이트 경로를 반환합니다.
 * 2-상태 블록(스위치/레드스톤/전구)은 powered가 truthy면 on, 아니면 off 스프라이트.
 * 컨베이어 블록은 powered 시 frame(0~3)에 따라 애니메이션 프레임을 반환합니다.
 * 블랙홀/화이트홀은 powered와 무관하게 frame에 따라 소용돌이 프레임을 반환합니다.
 * @param {string} blockType
 * @param {boolean} [powered=false] - 2-상태 블록의 활성화 여부
 * @param {number} [frame=0] - 애니메이션 프레임 인덱스 (컨베이어/블랙홀/화이트홀)
 * @param {boolean} [stealth=false] - 숨김모드로 드러난 배선: 진한 바탕 없이 빨간 선만 있는 스프라이트
 * @returns {string}
 */
export function getPlatformBlockSpritePath(blockType, powered = false, frame = 0, stealth = false) {
  if (blockType === "conveyor_block") {
    if (powered) return `assets/block/conveyor_block_on_${frame % CONVEYOR_ANIM_FRAMES}.png`;
    return STATEFUL_BLOCK_SPRITE.conveyor_block.off;
  }
  const holePrefix = HOLE_ANIM_SPRITE[blockType];
  if (holePrefix) return `assets/block/${holePrefix}_${((frame % HOLE_ANIM_FRAMES) + HOLE_ANIM_FRAMES) % HOLE_ANIM_FRAMES}.png`;
  if (blockType === "redstone_bridge_block") {
    const mask = (Number(powered) || 0) & 3;
    // 숨김모드로 드러날 땐 활성 방향(가로/세로)의 바탕 없는 배선 스프라이트를 쓴다.
    if (stealth && mask) return BRIDGE_STEALTH_SPRITE[mask];
    return BRIDGE_SPRITE[mask];
  }
  // 숨김모드로 드러난 레드스톤 배선은 진한 바탕 없이 빨간 선만 남긴 전용 스프라이트를 쓴다.
  if (stealth && REDSTONE_STEALTH_SPRITE[blockType]) return REDSTONE_STEALTH_SPRITE[blockType];
  const stateful = STATEFUL_BLOCK_SPRITE[blockType];
  if (stateful) return powered ? stateful.on : stateful.off;
  if (NEW_BLOCK_SPRITE[blockType]) return NEW_BLOCK_SPRITE[blockType];
  const type = PLATFORM_BLOCK_TYPES.includes(blockType) ? blockType : "platform_block";
  return `assets/equipment/${type}.bmp`;
}

/**
 * 플랫폼 블록의 <img> HTML 문자열을 반환합니다.
 * @param {string} blockType
 * @param {number} sizePx
 * @param {boolean} [powered=false] - 2-상태 블록의 활성화 여부
 * @param {number} [frame=0] - 컨베이어 애니메이션 프레임 인덱스
 * @param {boolean} [stealth=false] - 숨김모드로 드러난 십자 레드스톤 여부
 * @returns {string}
 */
export function buildPlatformBlockImgHtml(blockType, sizePx = 20, powered = false, frame = 0, stealth = false) {
  const src = getPlatformBlockSpritePath(blockType, powered, frame, stealth);
  return `<img src="${src}" width="${sizePx}" height="${sizePx}" alt="${blockType}" `
    + `style="display:block;image-rendering:pixelated;image-rendering:crisp-edges;">`;
}

/**
 * 2-상태 블록(스위치/레드스톤/전구/피스톤/게이트/리피터)의 on/off 스프라이트를
 * 한 번만 사전 로드합니다. 토글 시 src 교체로 이미지가 즉시 표시되도록 브라우저
 * 캐시·디코드를 확보 → 깜빡임 방지.
 */
let _statefulSpritesPreloaded = false;
export function preloadStatefulBlockSprites() {
  if (_statefulSpritesPreloaded) return;
  if (typeof Image === "undefined") return;
  _statefulSpritesPreloaded = true;
  for (const pair of Object.values(STATEFUL_BLOCK_SPRITE)) {
    new Image().src = pair.on;
    new Image().src = pair.off;
  }
  for (const src of Object.values(BRIDGE_SPRITE)) {
    new Image().src = src;
  }
  // 숨김모드로 드러나는 배선 전용(바탕 없는) 스프라이트 — 레드스톤 5종
  for (const src of Object.values(REDSTONE_STEALTH_SPRITE)) {
    new Image().src = src;
  }
  for (const src of Object.values(BRIDGE_STEALTH_SPRITE)) {
    new Image().src = src;
  }
  for (let i = 0; i < CONVEYOR_ANIM_FRAMES; i++) {
    new Image().src = `assets/block/conveyor_block_on_${i}.png`;
  }
  for (const prefix of Object.values(HOLE_ANIM_SPRITE)) {
    for (let i = 0; i < HOLE_ANIM_FRAMES; i++) {
      new Image().src = `assets/block/${prefix}_${i}.png`;
    }
  }
}

/**
 * 수조 state에서 활성 플랫폼 배열을 추출합니다.
 * @param {object} state
 * @returns {Array<{id:number, x:number, y:number}>}
 */
export function getActivePlatforms(state) {
  return Array.isArray(state?.entities?.platforms?.items)
    ? state.entities.platforms.items
    : [];
}

/**
 * 캐릭터가 실제로 밟고 있는 것으로 취급할 블록 id 집합을 계산합니다(스위치 눌림 판정용).
 * 캐릭터는 한 번에 하나의 착지 표면(s._platformId)에만 귀속되지만, 2레이어 구조에서는
 * 스위치(논리 레이어)가 플랫폼/기능 블록(z 위) 아래 같은 칸에 숨겨져 있을 수 있다.
 * 그런 경우에도 "밟고 서 있는 칸"의 스위치는 함께 눌린 것으로 취급해야
 * 장식 블록으로 배선을 가리는 용도(숨은 압력판)가 정상 동작한다.
 * @param {Array<{id:number,x:number,y:number,blockType:string}>} platforms
 * @param {Array<{_platformId?: number|null}>} chars
 * @returns {Set<number>}
 */
export function computeCharsOnPlatformIds(platforms, chars) {
  const result = new Set();
  if (!Array.isArray(platforms) || !Array.isArray(chars)) return result;
  const platformsById = new Map();
  const switchIdsByCell = new Map();
  for (const p of platforms) {
    platformsById.set(p.id, p);
    if (!SWITCH_TYPES.has(p.blockType)) continue;
    const key = `${p.x},${p.y}`;
    const list = switchIdsByCell.get(key);
    if (list) list.push(p.id);
    else switchIdsByCell.set(key, [p.id]);
  }
  for (const s of chars) {
    const platId = s?._platformId;
    if (platId == null) continue;
    result.add(platId);
    const plat = platformsById.get(platId);
    if (!plat) continue;
    const switchIds = switchIdsByCell.get(`${plat.x},${plat.y}`);
    if (switchIds) for (const id of switchIds) result.add(id);
  }
  return result;
}

/**
 * 플랫폼 블록이 현재 배치 가능한 Y 범위를 반환합니다.
 * 위 3칸, 아래 3칸은 배치 불가 영역입니다 (20px 그리드 기준).
 * (Shrimprium 원본은 위/아래 7칸 — VampireRaise에서 위아래로 한 줄씩 넓혀 각 3칸)
 * @param {number} tankH - 수조 높이 (기본 640)
 * @returns {{ minY: number, maxY: number }}
 */
export function getPlatformYRange(tankH = 640) {
  const totalRows = Math.round(tankH / PLATFORM_H);
  const OFF_ROWS = 3; // 위/아래 각 3칸 금지 (기존 4칸에서 위아래 한 줄씩 확장)
  return {
    minY: OFF_ROWS * PLATFORM_H,                        // 60px (tankH=640 기준)
    maxY: (totalRows - OFF_ROWS - 1) * PLATFORM_H,     // 560px (tankH=640 기준)
  };
}

/**
 * 1칸(20px)짜리 수직 통로를 안정적으로 통과하기 위한 캐릭터 수평 충돌 폭.
 * 히트박스가 정확히 PLATFORM_W와 같으면 부동소수/프레임 이동 오차로 양옆 블록에
 * 살짝 걸려 낙하·점프 통과가 막힐 수 있어, 실제 몸통 기준으로 여유를 둔다.
 */
export const CHAR_HITBOX_W = 14;

/**
 * 캐릭터의 충돌 히트박스(수평) 좌측 x와 폭을 반환합니다.
 * 스프라이트가 플랫폼 블록(PLATFORM_W=20px)보다 넓어도 1칸짜리 빈 공간을
 * 위아래로 통과할 수 있도록 중앙 몸통 폭(CHAR_HITBOX_W)만 충돌에 사용합니다.
 * 이미 더 좁은 캐릭터는 원래 폭을 유지합니다.
 * 모든 수평 충돌/상호작용 판정은 이 히트박스를 기준으로 해야 합니다.
 * @param {{ x: number, w: number }} char
 * @returns {{ x: number, w: number }} 히트박스 좌측 x와 폭
 */
export function getCharHitbox(char) {
  const x = Number(char?.x) || 0;
  const w = Number(char?.w);
  if (!Number.isFinite(w) || w <= CHAR_HITBOX_W) {
    return { x, w: Number.isFinite(w) ? w : 0 };
  }
  const hitboxW = Math.min(w, CHAR_HITBOX_W);
  const inset = (w - hitboxW) / 2;
  return { x: x + inset, w: hitboxW };
}

/**
 * 캐릭터와 특정 플랫폼 블록의 수평 겹침 여부를 반환합니다.
 * @param {{ x: number, w: number }} char - 캐릭터 위치 (x: left px, w: 너비 px)
 * @param {{ x: number }} plat - 플랫폼 블록 (x: left px, 너비는 PLATFORM_W 고정)
 * @returns {boolean}
 */
export function charOverlapsPlatformX(char, plat) {
  const hb = getCharHitbox(char);
  return hb.x + hb.w > plat.x && hb.x < plat.x + PLATFORM_W;
}

/**
 * 이번 프레임의 수평 이동 구간까지 포함해 캐릭터가 플랫폼을 스치는지 반환합니다.
 * 착지 판정은 세로축에서 nextY까지 미리 보므로, 가로축도 nextX까지 같이 봐야
 * 플랫폼 가장자리에 진입하는 프레임을 한 박자 늦게 놓치지 않습니다.
 * @param {{ x: number, w: number }} char
 * @param {{ x: number }} plat
 * @param {number} nextX
 * @returns {boolean}
 */
export function charSweepsPlatformX(char, plat, nextX) {
  const startXRaw = Number(char?.x);
  const endXRaw = Number(nextX);
  const widthRaw = Number(char?.w);
  const platformX = Number(plat?.x);
  if (![startXRaw, endXRaw, widthRaw, platformX].every(Number.isFinite)) return false;
  // 히트박스 기준으로 보정 (스프라이트가 넓어도 중앙 몸통 폭만 충돌).
  const width = Math.min(widthRaw, CHAR_HITBOX_W);
  const inset = (widthRaw - width) / 2;
  const startX = startXRaw + inset;
  const endX = endXRaw + inset;
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX) + width;
  return maxX > platformX && minX < platformX + PLATFORM_W;
}

/** 회전 정규화 */
function _normRotation(rotation) {
  return (((Number(rotation) || 0) % 360) + 360) % 360;
}

/** 90° 단위 회전을 방향에 적용한 결과 */
const _ROTATE_CW = { right: "down", down: "left", left: "up", up: "right" };
function _rotateDir(dir, rotation) {
  const r = _normRotation(rotation);
  let cur = dir;
  for (let i = 0; i < r / 90; i++) cur = _ROTATE_CW[cur];
  return cur;
}

/**
 * 피스톤의 face 방향(밀어내는 방향). 회전 0° = 우.
 * @returns {'up'|'down'|'left'|'right'}
 */
export function getPistonFaceDir(rotation = 0) {
  return _rotateDir("right", rotation);
}

/**
 * Repeater 입력 포트 방향. 회전 0° = 좌(왼쪽에서 입력).
 * @returns {'up'|'down'|'left'|'right'}
 */
export function getRepeaterInputDir(rotation = 0) {
  return _rotateDir("left", rotation);
}

/**
 * Repeater 출력 포트 방향. 회전 0° = 우.
 * @returns {'up'|'down'|'left'|'right'}
 */
export function getRepeaterOutputDir(rotation = 0) {
  return _rotateDir("right", rotation);
}

/**
 * 논리 게이트 출력 포트 방향. 회전 0° = 우 (모든 게이트 공통).
 * @returns {'up'|'down'|'left'|'right'}
 */
export function getGateOutputDir(rotation = 0) {
  return _rotateDir("right", rotation);
}

/**
 * 논리 게이트 입력 포트 방향 목록.
 * - NOT/diode: 1입력, 회전 0° = 좌(뒤).
 * - AND/OR/NAND/NOR/XOR: 2입력, 회전 0° = 상·하(양 측면). 출력(우)에 수직인 두 면.
 * @returns {Array<'up'|'down'|'left'|'right'>}
 */
export function getGateInputDirs(blockType, rotation = 0) {
  if (blockType === "not_gate_block" || blockType === "diode_block") {
    return [_rotateDir("left", rotation)];
  }
  return [_rotateDir("up", rotation), _rotateDir("down", rotation)];
}

/**
 * 블록의 신호 포트(연결 가능 방향) 집합을 반환합니다.
 * - cross / switch / lightbulb / gate: 4방향.
 * - 직선(straight): 0/180° → [left,right], 90/270° → [up,down].
 * - 꺾임(corner): 0° = [left,down], 회전마다 90° CW로 이동.
 * - repeater: {입력방향, 출력방향} 2포트 (옆은 미연결).
 * - piston: face 방향은 출력 전용(push/press)이라 신호 입력을 받지 않음 → 3포트(나머지 면).
 *   덕분에 피스톤이 누른 스위치의 신호가 face 면으로 곧장 자기 자신을 다시 powered
 *   시키는 단락을 막아준다 (repeater 끄면 piston 풀리지 않던 문제 해결). self-latch나
 *   깜빡 회로를 만들고 싶다면 측면으로 신호가 돌아오게 redstone 으로 우회 배선해야 함.
 * @param {string} blockType
 * @param {number} [rotation=0]  - degrees, 0/90/180/270
 * @returns {Set<'up'|'down'|'left'|'right'>}
 */
export function getBlockPorts(blockType, rotation = 0) {
  if (blockType === "redstone_straight_block") {
    const r = _normRotation(rotation);
    return r === 90 || r === 270
      ? new Set(["up", "down"])
      : new Set(["left", "right"]);
  }
  if (blockType === "redstone_corner_block") {
    const r = _normRotation(rotation);
    if (r === 90)  return new Set(["up", "left"]);
    if (r === 180) return new Set(["right", "up"]);
    if (r === 270) return new Set(["down", "right"]);
    return new Set(["left", "down"]);
  }
  if (blockType === "redstone_bridge_block") {
    return new Set(["up", "down", "left", "right"]);
  }
  if (blockType === "redstone_tee_block") {
    return new Set(["left", "right", "down"].map((d) => _rotateDir(d, rotation)));
  }
  if (blockType === "repeater_block") {
    return new Set([getRepeaterInputDir(rotation), getRepeaterOutputDir(rotation)]);
  }
  if (GATE_TYPES.has(blockType)) {
    return new Set([...getGateInputDirs(blockType, rotation), getGateOutputDir(rotation)]);
  }
  if (blockType === "piston_block") {
    const ports = new Set(["up", "down", "left", "right"]);
    ports.delete(getPistonFaceDir(rotation));
    return ports;
  }
  return new Set(["up", "down", "left", "right"]);
}

/** 하위 호환 별칭 (이전 이름 유지) */
export const getRedstonePorts = getBlockPorts;

/**
 * 블록 내부에서 서로 전기적으로 이어진 포트 묶음(그룹) 목록을 반환합니다.
 * 대부분의 블록은 모든 포트가 한 그룹으로 묶여 하나의 노드처럼 동작하지만,
 * redstone_bridge_block(끊어진 십자)는 상·하 그룹과 좌·우 그룹이 서로 분리되어
 * 교차할 뿐 신호가 옮겨붙지 않는다.
 * @param {string} blockType
 * @param {number} [rotation=0]
 * @returns {Array<Set<'up'|'down'|'left'|'right'>>}
 */
export function getBlockPortGroups(blockType, rotation = 0) {
  if (blockType === "redstone_bridge_block") {
    return [new Set(["up", "down"]), new Set(["left", "right"])];
  }
  return [getBlockPorts(blockType, rotation)];
}

/**
 * 컨베이어 블록의 이동 방향. 회전 0° = 오른쪽.
 * @param {number} [rotation=0]
 * @returns {'right'|'down'|'left'|'up'}
 */
export function getConveyorDir(rotation = 0) {
  return _rotateDir("right", rotation);
}

/**
 * 가시 블록의 가시 방향(뾰족한 면). 회전 0° = 위.
 * @param {number} [rotation=0]
 * @returns {'up'|'right'|'down'|'left'}
 */
export function getSpikeDir(rotation = 0) {
  return _rotateDir("up", rotation);
}

/**
 * 미끄럼 블록의 미끄러지는 방향(아래 방향).
 * 스프라이트(직각삼각형) 기준 경사면이 윗면인 회전만 미끄러진다.
 * 0° = 오른쪽(\ 경사: 좌상→우하), 270° = 왼쪽(/ 경사: 우상→좌하).
 * 90°/180°는 윗면이 평평한 봉우리라 미끄럼 없음(null 반환).
 * @param {number} [rotation=0]
 * @returns {'right'|'left'|null}
 */
export function getSlideDir(rotation = 0) {
  const r = _normRotation(rotation);
  if (r === 0)   return 'right';
  if (r === 270) return 'left';
  return null;
}

/**
 * 신호 그래프를 계산합니다.
 *   - 소스: 캐릭터가 올라탄 스위치, 인접한 powered 피스톤이 누르는 스위치,
 *           outputOn=true인 repeater(출력 포트 방향만).
 *   - 전파: redstone 시리즈(cross/straight/corner)는 포트가 양쪽 일치할 때 BFS로 전파.
 *           repeater는 입력 포트에서 신호를 받기만 하고 즉시 전파하지 않음(타이머 별도 처리).
 *   - 엔드: 전구/게이트/피스톤은 인접 신호 발산 블록의 포트가 자기 쪽이면 powered.
 *           repeater 자체의 powered 표시는 outputOn(시각용).
 *
 * 피스톤 → 스위치 press: 피스톤이 powered이면 face 셀의 스위치를 "누른" 것으로 본다.
 * 피드백 루프(스위치→피스톤→스위치)를 끊기 위해 piston.powered는 이번 프레임 값이 아닌
 * 이전 프레임의 pistonState.lastPowered를 사용한다. 즉 1프레임 지연이 생기는데,
 * 자기유지(latch)와 깜빡(oscillator) 회로 모두 이 지연 덕에 안정적으로 동작한다
 * (오실레이터는 repeater 250ms로 가시화 주기를 정한다).
 *
 * @param {Array<{id:number,x:number,y:number,blockType:string,rotation?:number,repeaterState?:object,pistonState?:object}>} platforms
 * @param {Set<number>} charsOnPlatformIds
 * @param {{ignorePistonPress?:boolean}} [options]  데코 모드 등에서 피스톤 press 무시 여부.
 * @returns {{ powered: Map<number, boolean>, repeaterInputs: Map<number, boolean>, poweredDirs: Map<number, Set<string>> }}
 *   poweredDirs: 블록별로 실제 신호가 도달한 방향 집합 (분리 십자의 가로/세로 구분 등에 사용).
 */
export function computeBlockSignals(platforms, charsOnPlatformIds, options = {}) {
  const powered = new Map();
  const repeaterInputs = new Map();
  if (!Array.isArray(platforms) || platforms.length === 0) return { powered, repeaterInputs };

  // 2레이어 구조로 한 칸에 논리 블록 + 플랫폼 블록이 겹칠 수 있어 셀당 블록 배열로 관리.
  // 신호는 인접 칸으로만 전달되며 같은 칸에 겹친 두 블록끼리는 연결되지 않는다.
  const byCell = new Map();
  const cellKey = (x, y) => `${x},${y}`;
  for (const p of platforms) {
    const key = cellKey(p.x, p.y);
    const list = byCell.get(key);
    if (list) list.push(p);
    else byCell.set(key, [p]);
  }

  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  const DIRS = ["up", "down", "left", "right"];
  const EMPTY_DIRS = new Set();
  const EMPTY_CELL = [];
  function neighborsInDirection(p, dir) {
    let list;
    if (dir === "up")         list = byCell.get(cellKey(p.x, p.y - PLATFORM_H));
    else if (dir === "down")  list = byCell.get(cellKey(p.x, p.y + PLATFORM_H));
    else if (dir === "left")  list = byCell.get(cellKey(p.x - PLATFORM_W, p.y));
    else if (dir === "right") list = byCell.get(cellKey(p.x + PLATFORM_W, p.y));
    return list ?? EMPTY_CELL;
  }

  // 이전 프레임에서 powered였던 피스톤이 face 방향으로 누르는 셀 좌표 집합.
  // 데코 모드(ignorePistonPress)에선 항상 비워 디폴트 상태로 보이게 한다.
  const pistonPressedCells = new Set();
  if (!options?.ignorePistonPress) {
    for (const p of platforms) {
      if (p.blockType !== "piston_block") continue;
      if (!p.pistonState?.lastPowered) continue;
      const face = getPistonFaceDir(p.rotation);
      let fx = p.x, fy = p.y;
      if (face === "up")    fy -= PLATFORM_H;
      else if (face === "down")  fy += PLATFORM_H;
      else if (face === "left")  fx -= PLATFORM_W;
      else if (face === "right") fx += PLATFORM_W;
      pistonPressedCells.add(cellKey(fx, fy));
    }
  }

  // 1단계: 자체 결정 상태 (스위치, repeater, timer 출력)
  for (const p of platforms) {
    if (p.blockType === "switch_block") {
      // NO: 캐릭터가 올라타거나 인접 피스톤이 누르면 ON
      const pressedByShrimp = !!charsOnPlatformIds?.has?.(p.id);
      const pressedByPiston = pistonPressedCells.has(cellKey(p.x, p.y));
      powered.set(p.id, pressedByShrimp || pressedByPiston);
    } else if (p.blockType === "switch_nc_block") {
      // NC: 디폴트 ON, 캐릭터 올라타거나 피스톤이 누르면 OFF
      const pressedByShrimp = !!charsOnPlatformIds?.has?.(p.id);
      const pressedByPiston = pistonPressedCells.has(cellKey(p.x, p.y));
      powered.set(p.id, !(pressedByShrimp || pressedByPiston));
    } else if (p.blockType === "repeater_block") {
      powered.set(p.id, !!p.repeaterState?.outputOn);
    } else if (GATE_TYPES.has(p.blockType)) {
      powered.set(p.id, !!p.gateState?.outputOn);
    } else if (SENSOR_TYPES.has(p.blockType)) {
      powered.set(p.id, !!p.sensorState?.outputOn);
    } else if (p.blockType === "timer_block") {
      powered.set(p.id, !!p.timerState?.outputOn);
    } else {
      powered.set(p.id, false);
    }
  }

  // 2단계: BFS — 소스에서 redstone 시리즈를 따라 전파 (포트 양방향 일치)
  // poweredDirs: 블록별로 실제 신호가 도달한 방향 집합. 대부분 블록은 포트 전체가
  // 한 그룹이라 powered되면 전체 방향이 채워지지만, bridge처럼 그룹이 분리된
  // 블록은 신호가 들어온 그룹의 방향만 채워져 반대 그룹으로 새지 않는다.
  const poweredDirs = new Map();
  const queue = [];
  const markPoweredGroup = (nb, enteredDir) => {
    const groups = getBlockPortGroups(nb.blockType, nb.rotation);
    const group = groups.find((g) => g.has(enteredDir)) || groups[0];
    let dirs = poweredDirs.get(nb.id);
    if (!dirs) {
      dirs = new Set();
      poweredDirs.set(nb.id, dirs);
    }
    let changed = false;
    for (const d of group) {
      if (!dirs.has(d)) {
        dirs.add(d);
        changed = true;
      }
    }
    if (changed) powered.set(nb.id, true);
    return changed;
  };
  const pushIfRedstone = (from, dir) => {
    for (const nb of neighborsInDirection(from, dir)) {
      if (!REDSTONE_TYPES.has(nb.blockType)) continue;
      if (!getBlockPorts(nb.blockType, nb.rotation).has(OPPOSITE[dir])) continue;
      if (!markPoweredGroup(nb, OPPOSITE[dir])) continue;
      queue.push(nb);
    }
  };
  // 시드: 스위치(전 4방향) + repeater(출력 1방향) + timer(전 4방향)
  for (const p of platforms) {
    if (SWITCH_TYPES.has(p.blockType) && powered.get(p.id)) {
      for (const dir of DIRS) pushIfRedstone(p, dir);
    } else if (p.blockType === "repeater_block" && p.repeaterState?.outputOn) {
      pushIfRedstone(p, getRepeaterOutputDir(p.rotation));
    } else if (GATE_TYPES.has(p.blockType) && p.gateState?.outputOn) {
      pushIfRedstone(p, getGateOutputDir(p.rotation));
    } else if (SENSOR_TYPES.has(p.blockType) && p.sensorState?.outputOn) {
      for (const dir of DIRS) pushIfRedstone(p, dir);
    } else if (p.blockType === "timer_block" && p.timerState?.outputOn) {
      for (const dir of DIRS) pushIfRedstone(p, dir);
    }
  }
  // BFS는 redstone 시리즈만 통과. 신호가 실제 도달한 방향(poweredDirs)으로만 더 퍼진다.
  while (queue.length > 0) {
    const r = queue.shift();
    const dirs = poweredDirs.get(r.id) || EMPTY_DIRS;
    for (const dir of DIRS) {
      if (dirs.has(dir)) pushIfRedstone(r, dir);
    }
  }

  // 헬퍼: 블록 nb가 dir 방향으로 신호를 발산하는가? (수신측 입장에서 신호 도착 여부)
  function emitsTowardDir(nb, dirFromNb) {
    if (SWITCH_TYPES.has(nb.blockType)) return !!powered.get(nb.id);
    if (REDSTONE_TYPES.has(nb.blockType)) {
      const dirs = poweredDirs.get(nb.id);
      return !!dirs && dirs.has(dirFromNb);
    }
    if (nb.blockType === "repeater_block") {
      if (!nb.repeaterState?.outputOn) return false;
      return getRepeaterOutputDir(nb.rotation) === dirFromNb;
    }
    if (GATE_TYPES.has(nb.blockType)) {
      if (!nb.gateState?.outputOn) return false;
      return getGateOutputDir(nb.rotation) === dirFromNb;
    }
    if (SENSOR_TYPES.has(nb.blockType)) return !!nb.sensorState?.outputOn;
    if (nb.blockType === "timer_block") return !!nb.timerState?.outputOn;
    return false;
  }

  // 3단계: 엔드포인트(lightbulb/gate/piston) powered 판정
  for (const p of platforms) {
    if (!ENDPOINT_TYPES.has(p.blockType)) continue;
    const myPorts = getBlockPorts(p.blockType, p.rotation);
    outer: for (const dir of DIRS) {
      if (!myPorts.has(dir)) continue;
      for (const nb of neighborsInDirection(p, dir)) {
        if (!getBlockPorts(nb.blockType, nb.rotation).has(OPPOSITE[dir])) continue;
        if (emitsTowardDir(nb, OPPOSITE[dir])) {
          powered.set(p.id, true);
          break outer;
        }
      }
    }
  }

  // 3.5단계: 투명게이트 클러스터 전파.
  // 하나의 게이트가 powered면 상하좌우로 직접 붙어있는 모든 게이트가 함께 켜진다.
  // (게이트끼리만 전파되며, 외부 블록(레드스톤/피스톤 등)으로 신호를 내보내지는 않는다.)
  const gateQueue = [];
  for (const p of platforms) {
    if (p.blockType === "gate_block" && powered.get(p.id)) gateQueue.push(p);
  }
  while (gateQueue.length > 0) {
    const g = gateQueue.shift();
    for (const dir of DIRS) {
      for (const nb of neighborsInDirection(g, dir)) {
        if (nb.blockType !== "gate_block") continue;
        if (powered.get(nb.id)) continue;
        powered.set(nb.id, true);
        gateQueue.push(nb);
      }
    }
  }

  // 3.6단계: 컨베이어 클러스터 전파.
  // 하나의 컨베이어가 powered면 인접한 모든 컨베이어가 함께 켜진다.
  const conveyorClusterQueue = [];
  for (const p of platforms) {
    if (p.blockType === "conveyor_block" && powered.get(p.id)) conveyorClusterQueue.push(p);
  }
  while (conveyorClusterQueue.length > 0) {
    const c = conveyorClusterQueue.shift();
    for (const dir of DIRS) {
      for (const nb of neighborsInDirection(c, dir)) {
        if (nb.blockType !== "conveyor_block") continue;
        if (powered.get(nb.id)) continue;
        powered.set(nb.id, true);
        conveyorClusterQueue.push(nb);
      }
    }
  }

  // 헬퍼: 블록 p의 dir 방향 입력 포트가 받는 신호 ON 여부.
  function inputAtDir(p, dir) {
    for (const nb of neighborsInDirection(p, dir)) {
      if (!getBlockPorts(nb.blockType, nb.rotation).has(OPPOSITE[dir])) continue;
      if (emitsTowardDir(nb, OPPOSITE[dir])) return true;
    }
    return false;
  }

  // 4단계: repeater 입력 상태 계산 (타이머 처리는 외부에서)
  for (const p of platforms) {
    if (p.blockType !== "repeater_block") continue;
    repeaterInputs.set(p.id, inputAtDir(p, getRepeaterInputDir(p.rotation)));
  }

  // 5단계: 논리 게이트 입력 상태 계산 (출력 갱신은 외부 tickGates에서).
  // 각 게이트의 입력 포트별 ON/OFF 배열을 모은다. 출력은 직전 프레임 gateState를
  // 소스로 쓰므로 여기 입력값은 게이트 간 연결에서도 1프레임 지연으로 안정적이다.
  const gateInputs = new Map();
  for (const p of platforms) {
    if (!GATE_TYPES.has(p.blockType)) continue;
    const dirs = getGateInputDirs(p.blockType, p.rotation);
    gateInputs.set(p.id, dirs.map((dir) => inputAtDir(p, dir)));
  }

  return { powered, repeaterInputs, gateInputs, poweredDirs };
}
