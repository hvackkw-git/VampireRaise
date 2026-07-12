// src/storage/storageAdapter.js
// 저장소 추상화 레이어 (Shrimprium storageAdapter 패턴 이식).
// 현재 구현체: localStorage (localStorageImpl)
// 향후 구현체: IndexedDB, 클라우드 동기화 캐시 등 — 인터페이스가 Promise 기반이라
// 비동기 저장소로 교체해도 호출부 수정이 필요 없습니다.
//
// 사용법:
//   initStorageAdapter(localStorageImpl);   // 앱 부팅 시 1회
//   const value = await storageGetJson(key, fallback);
//   await storageSetJson(key, value);

/** @type {StorageImpl|null} */
let _impl = null;

/**
 * @typedef {Object} StorageImpl
 * @property {string} name
 * @property {(key: string) => Promise<string|null>} getItem
 * @property {(key: string, value: string) => Promise<void>} setItem
 * @property {(key: string) => Promise<void>} removeItem
 */

/**
 * 저장소 구현체를 등록합니다. 앱 부팅 시 1회 호출.
 * @param {StorageImpl} impl
 */
export function initStorageAdapter(impl) {
  _impl = impl;
}

/** 현재 등록된 구현체를 반환합니다. */
function getImpl() {
  if (!_impl) throw new Error("[storageAdapter] initStorageAdapter() 호출 전에 접근했습니다.");
  return _impl;
}

// ─── localStorage 구현체 ──────────────────────────────────────────────────────
// 주의: async 시그니처지만 내부 쓰기는 동기로 완료됩니다.
// beforeunload 저장은 이 동기성에 의존합니다 (saveLoad.js 참고).

export const localStorageImpl = {
  name: "localStorage",

  async getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // quota 초과 등 쓰기 실패를 삼키면 저장이 성공한 것처럼 보여
      // 유저 모르게 진행 데이터가 유실된다. 호출자에게 전파한다.
      console.warn("[storage:localStorage] setItem 실패:", e);
      throw e;
    }
  },

  async removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

// ─── 편의 함수 ────────────────────────────────────────────────────────────────

/** @returns {Promise<string|null>} */
export async function storageGetItem(key) {
  return getImpl().getItem(key);
}

/** @returns {Promise<void>} */
export async function storageSetItem(key, value) {
  return getImpl().setItem(key, value);
}

/** @returns {Promise<void>} */
export async function storageRemoveItem(key) {
  return getImpl().removeItem(key);
}

/**
 * JSON으로 파싱한 값을 반환합니다. 없거나 파싱 실패 시 fallback.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export async function storageGetJson(key, fallback = null) {
  const raw = await getImpl().getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * 값을 JSON 직렬화하여 저장합니다.
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function storageSetJson(key, value) {
  await getImpl().setItem(key, JSON.stringify(value));
}
