/** Jombie Shrimp 체력 스킬의 현재 투자 포인트. */
export function zombieHpPoints(owner) {
  return Math.max(0, Math.floor(Number(owner?.zombieHpPoints) || 0));
}

/** 새로 감염되는 Jombie Shrimp에 더할 최대 체력. */
export function zombieHpBonus(owner) {
  return zombieHpPoints(owner);
}

export const ZOMBIE_TRAIT_COST = 5;
export const ZOMBIE_TRAIT_KEYS = Object.freeze([
  "zombie-yellow-revive", "zombie-red-poison", "zombie-black",
]);

export function hasZombieTrait(owner, key) {
  return ZOMBIE_TRAIT_KEYS.includes(key) && owner?.zombieTrait === key;
}

/** 2~4번 Jombie Shrimp 특성 중 하나를 SP 5로 1회 습득한다. */
export function investZombieTrait(owner, key) {
  if (!owner || owner.side !== "vampire" || !ZOMBIE_TRAIT_KEYS.includes(key)) return false;
  if (owner.zombieTrait) return false;
  const skillPoints = Math.max(0, Math.floor(Number(owner.skillPoints) || 0));
  if (skillPoints < ZOMBIE_TRAIT_COST) return false;
  owner.skillPoints = skillPoints - ZOMBIE_TRAIT_COST;
  owner.zombieTrait = key;
  return true;
}

/** SP 1을 사용해 소유 Jombie Shrimp의 최대/현재 체력을 1 올린다. */
export function investZombieHp(owner, chars = []) {
  if (!owner || owner.side !== "vampire") return false;
  const skillPoints = Math.max(0, Math.floor(Number(owner.skillPoints) || 0));
  if (skillPoints <= 0) return false;

  owner.skillPoints = skillPoints - 1;
  owner.zombieHpPoints = zombieHpPoints(owner) + 1;
  for (const zombie of chars) {
    if (zombie.side !== "slave" || zombie.ownerVampireId !== owner.id) continue;
    zombie.maxHp = Math.max(1, Number(zombie.maxHp) || 1) + 1;
    zombie.hp = Math.min(zombie.maxHp, Math.max(0, Number(zombie.hp) || 0) + 1);
  }
  return true;
}
