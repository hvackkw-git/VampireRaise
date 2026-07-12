// src/test/memoryStorage.js
// 테스트용 인메모리 StorageImpl — storageAdapter 인터페이스 준수.

export function memoryStorageImpl() {
  const values = new Map();
  return {
    name: "memory",
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}
