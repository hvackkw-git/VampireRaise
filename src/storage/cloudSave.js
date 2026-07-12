// src/storage/cloudSave.js
// 클라우드 세이브 훅 (Shrimprium cloudSave 패턴의 자리표시자).
// 아직 백엔드가 없어 모두 no-op입니다. 클라우드 연동 시 이 파일만 구현하면
// saveLoad.js의 로컬/클라우드 병합(_savedAt 최신 우선)이 그대로 동작합니다.
//
// 계약:
// - 페이로드는 gameState.toSaveData() 결과에 _savedAt(ISO 문자열)이 붙은 객체.
// - downloadSave()는 원격 세이브 객체 또는 null(없음/미로그인/실패)을 반환.
// - uploadSave(payload)는 성공 여부를 반환. 실패해도 로컬 저장에는 영향 없음.

/**
 * 클라우드에서 세이브를 내려받습니다.
 * @returns {Promise<object|null>}
 */
export async function downloadSave() {
  return null;
}

/**
 * 세이브 페이로드를 클라우드에 업로드합니다.
 * @param {object} _payload
 * @returns {Promise<boolean>}
 */
export async function uploadSave(_payload) {
  return false;
}
