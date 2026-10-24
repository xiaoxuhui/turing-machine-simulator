import { normalizeSpeed } from "./speed";

const SPEED_KEY = "turing-machine-simulator.speed.v1";

export function loadSpeedPreference(storage: Pick<Storage, "getItem">): number | null {
  try {
    const raw = storage.getItem(SPEED_KEY);
    if (raw === null || raw.trim() === "") return null;
    const speed = Number(raw);
    return Number.isInteger(speed) && speed >= 1 && speed <= 1000 ? speed : null;
  } catch {
    return null;
  }
}

export function saveSpeedPreference(storage: Pick<Storage, "setItem">, speed: number): string | null {
  try {
    storage.setItem(SPEED_KEY, String(normalizeSpeed(speed)));
    return null;
  } catch {
    return "无法保存目标速度；当前页调速仍可使用。";
  }
}
