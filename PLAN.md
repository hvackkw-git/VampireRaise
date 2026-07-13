# Vampire Shrimp Frenzy — 개발 계획

Shrimprium의 "플랫폼 방치형" 부분만 체리피킹해서 만드는 새우 웨이브 디펜스형 방치 게임.

세계관 명칭은 `Vamp Shrimp`, `Holy Shrimp`, `Jombie Shrimp`를 사용한다. 내부 진영 ID `vampire`, `human`, `slave`는 저장 호환성을 위해 유지한다.

## 1. 컨셉 요약

- 수조(320×640) 안에서 **Vamp Shrimp**를 키운다. Vamp Shrimp는 플랫폼 위를 랜덤하게 돌아다닌다.
- 레벨/웨이브에 따라 **Holy Shrimp**들이 몰려와 Vamp Shrimp를 잡으려 한다. 웨이브가 진행될수록 강해지고, 자동 웨이브 토글이 있다.
- Vamp Shrimp가 Holy Shrimp를 잡으면 **전염**시켜 **Jombie Shrimp**로 만든다. Jombie Shrimp는 Vamp Shrimp 편에서 싸운다.
- 캐릭터마다 레벨·경험치·스킬(트리)이 있고, 직업 시스템(Vamp Shrimp: 흑마법사/암흑기사, Holy Shrimp: 성직자/성기사/궁병 등)은 **추후** 분류한다.
- 프리스티지(환생) 시스템은 **향후 구현** — 상태 훅만 마련.

### 임시 어셋 (직업 미분류 단계)

| 역할 | 스프라이트 (Shrimprium 재활용) |
|---|---|
| Vamp Shrimp | `shrimp-4frame-vampire-dark.png` (쨍한 빨간새우, cherry_red에 검은 외곽선·마디 추가) |
| Holy Shrimp | `shrimp-4frame-blue_velvet.png` (파란새우) |
| Jombie Shrimp | `shrimp-4frame-black_king.png` (검은새우) |

## 2. Shrimprium에서 재활용하는 것

| 재활용 대상 | 원본 | 비고 |
|---|---|---|
| 플랫폼 블록 전체 (스프라이트·타입·신호/로직) | `src/ui/platformBlockRenderer.js`, `src/core/logicBlocks.js`, `assets/block/`, `assets/equipment/` | 거의 그대로 복사. "새우 밟음" 판정 → "캐릭터 밟음"으로 일반화 |
| 배치 규칙 (꾸미기 모드) | `src/core/decorateModeHandlers.js` 중 플랫폼 파트 | 20px 그리드, 상/하 4칸 배치금지(원본 7칸에서 위아래 3칸씩 확장), 논리/플랫폼 2레이어 겹침, 이동 시 스왑, 회전, 배치 가능 격자 오버레이 |
| 캐릭터 물리 | `src/ui/mountAquarium.js` 중 새우 물리 파트 **추출** | 중력, 플랫폼 착지(스윕 판정), 히트박스, IDLE/CRAWL/JUMP 상태머신. 5,220줄 모놀리스에서 필요한 부분만 떼어 슬림 엔진으로 재작성 |
| 기믹 블록 동작 | mountAquarium 내 해당 파트 | 스프링·가시·컨베이어·미끄럼·블랙홀/화이트홀·스턴·리콜·스위치/레드스톤/게이트 |
| UI 골격 | `style.css`, 픽셀 폰트(Galmuri), 토스트, 패널 매니저 | 320×670 논리 해상도 유지 |
| 저장 구조 | `src/state/` 패턴 | localStorage 저장/복원 (스키마는 신규) |

### 빼는 것

- 수질/생태 시뮬레이션 전체 (질소순환, 온도, 산소, 조류, 수초, 미생물)
- 유전자/교배, 성장 단계, 포만감/먹이
- 다중 수조·선반, 커뮤니티 수조, 퀘스트/도감/거래
- 로그인/Supabase/Capacitor/PWA — 순수 정적 웹으로 시작

### 수질 시뮬레이션에 묶인 블록 처리 (확정)

`food_dispenser`(먹이), `carbonate/calcium`(탄산염), `water_change`(물갈이), `temp_sensor`(수온) 블록은 **완전 삭제** — 블록 목록·스프라이트·배치 UI에서 모두 제외.
`count_sensor`는 "살아있는 Vamp Shrimp 수" 센서로 재해석해 유지.

### 꾸미기 모드 (확정)

Shrimprium의 플랫폼 꾸미기 모드와 **동일하게** 구현:
그리드 오버레이, 탭/드래그 연속 배치, 같은 레이어 점유 시 빨간 플래시 실패, 블록 탭 선택 →
드래그 이동(그리드 스냅, 겹치면 스왑)/90° 회전/회수/스텔스 투명화 토글, 블랙홀-화이트홀
자동 쌍 배치(짝 공간 없으면 배치 취소, 회수 시 쌍 제거), 리콜 블록 수조당 1개,
상/하 4칸 배치 금지(원본 7칸에서 확장), 논리/플랫폼 2레이어 겹침 허용.

## 3. 새로 만드는 것

### 3.1 캐릭터 시스템

```
character = {
  id, side: 'vampire' | 'human' | 'slave',
  x, y, vx, vy, dir, state,          // 물리 (Shrimprium 새우와 동일 구조)
  _platformId,
  level, exp, hp, maxHp, atk,
  job: null,                          // 향후 직업 분류용 (v1: null)
  skills: [],                         // 향후 스킬트리용 (v1: 빈 배열)
}
```

- **Vamp Shrimp AI**: 랜덤 이동(IDLE↔CRAWL↔JUMP), 사거리 내 Holy Shrimp가 있으면 공격.
- **Holy Shrimp AI**: 가장 가까운 Vamp/Jombie Shrimp를 향해 이동, 사거리 내에서 공격.
- **Jombie Shrimp AI**: Vamp Shrimp와 동일하게 랜덤 이동 + Holy Shrimp 공격.
- **전투**: 틱 기반 근접 공격 (공격 쿨다운, hp 감소). v1은 전원 근접.
- **전염**: Vamp Shrimp의 공격으로 Holy Shrimp hp가 0이 되면 그 자리에서 Jombie Shrimp로 전환.
- **경험치**: 처치 기여 시 exp 획득 → 레벨업 시 maxHp/atk 성장. 스킬은 데이터 구조만.

### 3.2 웨이브 시스템

- 웨이브 N: Holy Shrimp `count(N)`마리가 수조 상단에서 낙하 스폰, 스탯은 N에 따라 스케일.
- 웨이브 클리어(Holy Shrimp 전멸) → 보상(재화) → 다음 웨이브 버튼 or **자동 웨이브 토글** 시 즉시 진행.
- 패배 조건: 베이스 코어 소진 → 웨이브 리셋(재도전). Vamp Shrimp 전멸은 더 이상 웨이브를 끝내지 않으며,
  죽은 개체는 각자 쿨타임(5초+레벨×1초) 후 자동 부활한다.
- 재화(피): 웨이브 보상으로 획득, 블록 구매/Vamp Shrimp 추가 등에 사용 (v1은 최소한만).

### 3.3 캐릭터 정보 패널 (수질 패널 대체)

캐릭터 탭(클릭) 시 하단 패널에 표시:

- 이름/진영, **레벨**, **직업**(v1: "미분류"), **경험치 바**, hp/atk
- **스킬트리** 영역: v1은 잠금 상태의 빈 트리 UI (자리만)

### 3.4 HUD

- 현재 웨이브, 남은 Holy Shrimp 수, 재화, 자동 웨이브 토글, 다음 웨이브 버튼
- 블록 배치(꾸미기) 모드 진입 버튼 — Shrimprium 방식 재활용

## 4. 프로젝트 구조 (신규 레포)

```
VampireRaise/
├─ index.html            # 최소 셸 (로그인/PWA/SEO 없음)
├─ style.css
├─ assets/               # shrimprium에서 필요한 것만 복사
│  ├─ block/  equipment/  shrimp_variants/(3종)  fonts/
├─ src/
│  ├─ index.js           # 부트스트랩 + 게임 루프
│  ├─ constants.js       # 수조/그리드/전투 상수
│  ├─ state/             # 초기 상태, localStorage 저장/복원 (prestige 필드 포함)
│  ├─ platform/          # ★재활용: platformBlockRenderer, logicBlocks, blockEffects
│  ├─ decorate/          # ★재활용: 배치 규칙/그리드 오버레이/인벤토리
│  ├─ engine/            # 캐릭터 물리 (mountAquarium에서 추출·슬림화)
│  ├─ game/              # AI, 전투, 전염, 웨이브, 레벨/경험치
│  └─ ui/                # 수조 마운트, HUD, 캐릭터 정보 패널, 토스트
└─ src/test/             # vitest (물리·신호·전투·웨이브 단위 테스트)
```

빌드 없는 순수 ES 모듈 (`npx serve`로 구동) — Shrimprium과 동일 방식.

## 5. 마일스톤 (검증 기준 포함)

1. **스캐폴드 + 수조 + 블록 배치**
   레포 골격, 어셋 복사, 수조 렌더, 꾸미기 모드(배치/이동/회전/회수, 그리드 규칙).
   → 검증: 브라우저에서 블록 배치·스왑·금지영역이 Shrimprium과 동일하게 동작.
2. **캐릭터 물리 엔진**
   빨간새우(Vamp Shrimp)가 플랫폼 위를 랜덤하게 걷고/점프하고/착지.
   → 검증: 물리 헬퍼 vitest + 육안 확인 (플랫폼 밟기, 스위치 눌림, 기믹 블록 반응).
3. **웨이브 + 전투 + 전염**
   Holy Shrimp 스폰, 근접 전투, 사망 시 Jombie Shrimp 전환, 웨이브 클리어/패배 흐름.
   → 검증: 전투/전염/웨이브 스케일 단위 테스트 + 플레이 확인.
4. **레벨/경험치 + 캐릭터 정보 패널**
   처치 exp, 레벨업 성장, 캐릭터 클릭 → 정보 패널(레벨/직업/경험치/스킬트리 자리).
   → 검증: 클릭한 캐릭터의 스탯이 패널에 실시간 반영.
5. **자동 웨이브 + 저장 + 밸런싱**
   자동 웨이브 토글, localStorage 저장/복원, 초기 밸런스 곡선.
   → 검증: 새로고침 후 상태 유지, 웨이브 10까지 자연스러운 난이도.

### 향후 (v1 이후)

- 직업 분류(흑마법사/암흑기사 vs 성직자/성기사/궁병) + 직업별 스킬·원거리 공격
- 스킬트리 실제 구현, 프리스티지(환생), 전용 캐릭터 어셋
- **Vamp Shrimp 추적 이동 AI** (아래 별도 계획)

## 6.5 Vamp Shrimp 추적 이동 AI — 혈귀 돌진 (구현됨)

원래 계획(점프 내비게이션 그래프)은 **혈귀 돌진(DASH) + 플랫폼 윗면 핑** 방식으로
대체·구현했다 (`src/game/ai.js`). 확정된 이동규칙:

### 감지·핑 (공통)

- 비전투 유닛은 `PING_REFRESH_S`(1초)마다 감지 원(`DETECT_RANGE`, 진영별) 안의
  최근접 적에게 핑을 찍고 다음 갱신까지 그쪽으로 걷는다. 원 밖이면 핑 해제 → 랜덤 배회.
- **Vamp Shrimp 핑은 적 본체가 아니라 "적에서 가장 가까운 플랫폼 윗면"을 가리킨다.**
  적이 서 있을 수 있는 플랫폼 윗면 목표가 없으면(맨바닥 등) 핑도 돌진도 하지 않는다.

### 혈귀 돌진 (Vamp Shrimp 전용 패시브)

1. **발동 조건**: 지상 상태(IDLE/STAY/CRAWL) + 쿨다운(`DASH_COOLDOWN_S`) 종료 +
   감지 원 안의 적 중, 플랫폼 블록을 장애물로 둔 **20px 그리드 BFS 우회 최단 경로**가
   `감지범위 × DASH_ROUTE_MULT` 예산 이내인 대상이 있을 때. 너무 돌아가야 하면 미발동.
2. **목표점**: 대상 적에서 가장 가까운 **플랫폼 윗면 착지점** (블록 중심 위).
   up-가시·스프링·블랙홀 윗면은 착지 목표에서 제외 (돌진 착지는 기믹 판정을 안 거치므로).
3. **비행**: 중력·지형 충돌 무시, `DASH_SPD`로 BFS 웨이포인트를 따라 비행.
   경로의 중간 높이는 "설 수 있는 높이"(바닥·플랫폼 윗면)로 스냅해 자연스럽게 보인다.
4. **지형 기준은 물리와 동일**: OFF 게이트는 벽(밟을 수 있음), ON(투명) 게이트는 통과.
   레드스톤 배선·스턴 블록·화이트홀은 벽이 아니다.
5. **종료**:
   - **도착** (목표 4px 이내) → 목표 플랫폼 윗면에 스냅 착지 후 IDLE.
   - **중단** (대상 사망 / `DASH_MAX_S` 타임아웃 / 착지 플랫폼 소실·투명화) →
     목표로 순간이동하지 않고 **그 자리에서 정지 후 자연 낙하(FALL)**.
   - 어느 쪽이든 쿨다운(`DASH_COOLDOWN_S`)이 걸린다.
6. **Jombie Shrimp는 돌진하지 않는다** (핑 걷기만). `DASH_ROUTE_MULT`는 향후 스킬 성장 요소.

향후 확장 아이디어(보류): 걷기+점프 기반 내비게이션 그래프(원안)는 지상 유닛(Holy/Jombie Shrimp)
추적 강화가 필요해지면 재검토.

## 7. 확정된 결정

1. **수질 관련 블록 완전 삭제** (먹이 분배기·탄산염·칼슘·물갈이·수온 센서). 로직/기믹/장식 블록은 전부 유지.
2. **꾸미기 모드는 Shrimprium과 동일** 규칙·조작으로 구현.
3. **MVP 블록 경제**: 팔레트에서 무제한 배치 (상점/인벤 수량은 추후).
4. **패배 처리**: 베이스 코어 소진 시 이전 웨이브부터 재도전. Vamp Shrimp 전멸은 더 이상 패배가 아니다
   (개체별 자동 부활 쿨타임으로 대체).

## 8. Vamp Shrimp 근접 slam 공격 모션 (확정)

**대상: 빨간 새우(Vamp Shrimp, `side === "vampire"`)의 근접 FIGHT 공격만.**
Holy/Jombie Shrimp의 근접 공격은 현재의 즉발 데미지 그대로 유지한다.

### 8-1. 개념 / 타임라인

즉발 데미지를 **스윙 상태머신**으로 바꾼다. `_atkCd` 주기(`ATTACK_COOLDOWN_S` = 1.0s)는
그대로 두고, 그 안에 스윙이 들어간다.

```
_atkCd<=0 → 스윙 시작
  [0 → RAISE_S]        새우 앞쪽(head) 0° → +30° 로 들어올림 (윈드업)
  [RAISE_S → +SLAM_S]  +30° → 0° 로 내려치며 원위치 복귀
  각도 0° 복귀 순간 = SLAM 시점 → 데미지 판정 + slam FX
스윙 종료 후 _atkCd 잔여 시간 대기 → 다음 스윙
```

- **데미지는 "들어올렸다가 내려쳐 원위치로 돌아온 순간"(내려치는 타격의 끝)에 들어간다.**
- 총 스윙 길이(RAISE_S+SLAM_S ≈ 0.34s) < ATTACK_COOLDOWN_S(1.0s) → 공격 주기 유지.

### 8-2. 상수 (`src/constants.js`)

```js
export const ATTACK_RAISE_S = 0.22;       // 들어올리는 시간
export const ATTACK_SLAM_S  = 0.12;       // 내려치는 시간 (끝나는 순간 = slam)
export const ATTACK_RAISE_DEG = 30;       // 최대 들어올림 각도
export const SLAM_REACH = 30;             // slam 정면 유효 거리 (중심 간 px)
export const SLAM_MAX_DY = ENGAGE_MAX_DY; // slam 세로 허용차 재사용
```

### 8-3. 전투 로직 (`src/game/combat.js`)

- char 스윙 필드(기본 falsy): `_swinging`, `_swingT`, `_slamFired`.
- `engage`/`disengage`, `infectToSlave`, `reviveZombieOnce`, 돌진 진입(`ai.js beginDash`) 등
  **FIGHT를 떠나는 모든 지점에서 스윙 리셋**(`_swinging=false; _swingT=0; _slamFired=false`).
- "2) 교전 유지·공격" 루프를 2갈래로 분기:
  - `c.side === "vampire"` → **스윙 상태머신**
    - `_atkCd<=0 && !_swinging` → 스윙 시작만(`_swinging=true; _swingT=0; _slamFired=false; _atkCd=ATTACK_COOLDOWN_S`). 데미지 없음.
    - `_swinging` → `_swingT += simDt`. `_swingT >= RAISE_S+SLAM_S && !_slamFired` → **SLAM**:
      - `isInSlamArea(c, t)`로 **현재** 타깃이 정면 slam 영역에 있는지 재판정.
      - 안 → 기존 데미지 계산(빨강 복수 `revengeAttackMult`, 초록 연타 `multiHitChance` 로직을 여기로 이동)으로 `hitRecords` push + `slam`(connect) 이벤트.
      - 밖 → 데미지 없이 `slam`(miss/whiff) 이벤트만.
      - `_slamFired=true`.
    - `_swingT`가 더 지나면 `_swinging=false`.
  - 그 외 진영 → **기존 즉발 데미지 (변경 없음)**.
- slam 영역 판정:

```js
function isInSlamArea(a, t) {
  const ax=a.x+a.w/2, ay=a.y+a.h/2, tx=t.x+t.w/2, ty=t.y+t.h/2;
  const dxFront = (tx-ax) * a.dir;            // 정면이면 양수
  return dxFront > -a.w/2 && dxFront <= SLAM_REACH && Math.abs(ty-ay) <= SLAM_MAX_DY;
}
```

- **회피 창 = 윈드업+내려침(≈0.34s)**. 이 창 동안 타깃이 정면 영역을 벗어나면(돌진/넉백/`tickSeparation` 밀림/스턴 해제 이동 등) 헛스윙.

### 8-4. 렌더: 기울기 모션 (`src/ui/tankView.js`)

`renderChars`의 sprite transform을 스윙 각도와 합성 (vampire만):

```js
const ang = c.side === "vampire" ? swingAngle(c) : 0;  // _swinging이면 0→30→0, 아니면 0
const flip = c.dir > 0 ? "scaleX(-1) " : "";
entry.sprite.style.transform = `${flip}rotate(${ang}deg)`;
entry.pattern.style.transform = entry.sprite.style.transform;
```

- `swingAngle`: `_swingT`을 RAISE_S/SLAM_S 구간으로 나눠 `ATTACK_RAISE_DEG`까지 보간.
- `.char-sprite`에 `transform-origin`을 몸통 뒤쪽-하단(rearing)으로. scaleX(-1) 좌표 뒤집힘 때문에
  각도 부호/origin은 구현 시 양방향 눈으로 확인해 "새우 앞쪽이 들리도록" 확정.

### 8-5. slam FX (`src/ui/tankView.js` + `style.css`)

- `renderCombatEvents`에 `slam` 케이스 추가: 새우 **정면 좌표**(`c.x + (dir>0? c.w : 0)` 부근, 몸통 중심 y)에
  slam FX 스폰(`spawnDashFx` 계열). connect/miss 클래스 구분(`fx-slam` / `fx-slam-miss` 옅게).
- `style.css`에 `.fx-slam` 키프레임 추가. connect 시엔 기존 `hit`의 `-dmg` 플로팅과 자연히 겹침.

### 8-6. 테스트 (`src/test/combatWaves.test.js`)

- Holy/Jombie 즉발 케이스는 손대지 않음.
- **vampire가 공격자인 케이스만** 슬램 타이밍(RAISE_S+SLAM_S)만큼 시뮬 진행 후 검증하도록 수정
  (예: vamp→human hp, 빨강 복수 배율).
- 신규: vampire **슬램 회피 테스트**(윈드업 중 타깃을 slam 영역 밖으로 → 데미지 0 + miss 이벤트).

### 8-7. 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `src/constants.js` | slam 타이밍/각도/영역 상수 |
| `src/game/combat.js` | vampire 스윙 상태머신, slam 시점 데미지, `isInSlamArea`, `slam` 이벤트, 스윙 리셋 |
| `src/ui/tankView.js` | vampire 스윙 각도 회전 합성, `slam` FX |
| `style.css` | `.char-sprite` transform-origin, `.fx-slam` 애니메이션 |
| `src/test/combatWaves.test.js` | vampire 이연 데미지 반영 + 회피 테스트 추가 |
