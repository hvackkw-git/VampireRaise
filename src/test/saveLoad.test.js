import { describe, it, expect, beforeEach } from "vitest";
import { SAVE_KEY, saveState, loadState, clearSave } from "../state/saveLoad.js";
import { createInitialState, toSaveData } from "../state/gameState.js";
import { initStorageAdapter, storageGetJson, storageSetItem } from "../storage/storageAdapter.js";
import { memoryStorageImpl } from "./memoryStorage.js";

describe("saveLoad (storageAdapter 기반)", () => {
  beforeEach(() => {
    initStorageAdapter(memoryStorageImpl());
  });

  it("저장 → 불러오기 왕복: 핵심 진행 데이터가 복원된다", async () => {
    const state = createInitialState();
    state.blood = 42;
    state.wave.current = 7;
    state.account = { level: 3, exp: 10 };
    expect(await saveState(state)).toBe(true);

    const restored = await loadState();
    expect(restored.blood).toBe(42);
    expect(restored.wave.current).toBe(7);
    expect(restored.account).toEqual({ level: 3, exp: 10 });
    expect(restored.chars.items.length).toBe(state.chars.items.length);
  });

  it("저장 시 _savedAt 메타데이터를 기록한다 (클라우드 충돌 해결용)", async () => {
    await saveState(createInitialState());
    const raw = await storageGetJson(SAVE_KEY, null);
    expect(typeof raw._savedAt).toBe("string");
    expect(Number.isNaN(Date.parse(raw._savedAt))).toBe(false);
  });

  it("_savedAt이 없는 구버전 세이브도 불러온다 (하위 호환)", async () => {
    const legacy = toSaveData(createInitialState()); // _savedAt 없음
    await storageSetItem(SAVE_KEY, JSON.stringify(legacy));
    const restored = await loadState();
    expect(restored).not.toBeNull();
    expect(restored.version).toBe(1);
  });

  it("세이브 없음/손상/스키마 불일치 시 null", async () => {
    expect(await loadState()).toBeNull();

    await storageSetItem(SAVE_KEY, "{손상된 JSON");
    expect(await loadState()).toBeNull();

    await storageSetItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    expect(await loadState()).toBeNull();
  });

  it("clearSave: 저장 슬롯이 삭제된다", async () => {
    await saveState(createInitialState());
    await clearSave();
    expect(await loadState()).toBeNull();
  });
});
