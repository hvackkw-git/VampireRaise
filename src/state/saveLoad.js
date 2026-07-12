// src/state/saveLoad.js
// 게임 상태 저장/불러오기 — storageAdapter 기반 (Shrimprium saveLoad 패턴 이식).
// 직렬화/복원 로직은 gameState.js(toSaveData/fromSaveData)에 순수 함수로 분리되어
// 있어, 클라우드 업로드/다운로드에도 동일한 페이로드를 재사용합니다.

import {
  storageGetJson,
  storageRemoveItem,
  storageSetJson,
} from "../storage/storageAdapter.js";
import { downloadSave } from "../storage/cloudSave.js";
import { toSaveData, fromSaveData } from "./gameState.js";

export const SAVE_KEY = "vampireraise.save.v1";

/**
 * 현재 state를 저장합니다.
 * localStorage 구현체의 쓰기는 동기로 완료되므로 beforeunload에서
 * await 없이 호출해도 저장이 보장됩니다.
 * @param {object} state
 * @returns {Promise<boolean>} 성공 여부
 */
export async function saveState(state) {
  try {
    const payload = {
      ...toSaveData(state),
      // 클라우드 연동 시 로컬/원격 충돌 해결(최신 우선)에 사용
      _savedAt: new Date().toISOString(),
    };
    await storageSetJson(SAVE_KEY, payload);
    return true;
  } catch (e) {
    console.warn("[saveLoad] 저장 실패:", e);
    return false;
  }
}

/**
 * 두 세이브 후보 중 _savedAt이 더 최신인 쪽을 반환합니다. 동률이면 a 우선.
 * 구버전 세이브는 _savedAt이 없으며, 상대가 있으면 더 오래된 것으로 취급됩니다.
 * @param {object|null} a
 * @param {object|null} b
 * @returns {object|null}
 */
function newerSave(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b._savedAt ?? "") > (a._savedAt ?? "") ? b : a;
}

/**
 * 저장된 state를 불러옵니다.
 * 로컬과 클라우드 세이브를 모두 읽어 더 최신인 쪽을 복원합니다.
 * (클라우드 미연동 시 downloadSave()는 항상 null → 로컬만 사용)
 * @returns {Promise<object|null>} 복원된 state, 없거나 손상 시 null
 */
export async function loadState() {
  try {
    const [localData, cloudData] = await Promise.all([
      storageGetJson(SAVE_KEY, null),
      downloadSave(),
    ]);
    const data = newerSave(localData, cloudData);
    return data ? fromSaveData(data) : null;
  } catch (e) {
    console.warn("[saveLoad] 불러오기 실패:", e);
    return null;
  }
}

/**
 * 저장 슬롯을 삭제합니다 (처음부터 재시작 시 사용).
 * @returns {Promise<void>}
 */
export async function clearSave() {
  try {
    await storageRemoveItem(SAVE_KEY);
  } catch {}
}
