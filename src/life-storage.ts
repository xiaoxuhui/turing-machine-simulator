import type { LifePattern } from "./life";
export interface LifeSession { pattern: LifePattern; seed: LifePattern; camera: { x: number; y: number; scale: number }; speed: number }
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("turing-machine-conway-life", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sessions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开生命游戏存档。"));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
export async function readLifeSession(): Promise<LifeSession | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("sessions", "readonly"), request = transaction.objectStore("sessions").get("current");
    let value: LifeSession | undefined;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = transaction.onabort = () => reject(new Error("生命游戏存档读取失败。"));
  });
}
export async function writeLifeSession(value: LifeSession): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("sessions", "readwrite");
    transaction.objectStore("sessions").put(value, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error("生命游戏存档写入失败。"));
  });
}
