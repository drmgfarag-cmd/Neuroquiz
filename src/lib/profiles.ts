import { db, getMeta, setMeta, type StudyProfile } from "./db";
import { newSrs } from "./srs";

export const PROFILE_TABLES = ["questionStates", "cardStates", "sessions", "userFlashcards", "userCases"] as const;
const DEFAULT: StudyProfile = { id: "default", name: "My profile", createdAt: 0 };

export async function activeProfile(): Promise<StudyProfile> {
  const id = await getMeta("profile:active", DEFAULT.id);
  return (await db.profiles.get(id)) ?? DEFAULT;
}

export async function listProfiles(): Promise<StudyProfile[]> {
  if (!(await db.profiles.get(DEFAULT.id))) await db.profiles.put(DEFAULT);
  return db.profiles.toArray();
}

export async function addProfile(name: string): Promise<StudyProfile> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Enter a profile name.");
  const profile = { id: crypto.randomUUID(), name: clean, createdAt: Date.now() };
  await db.profiles.add(profile);
  return profile;
}

export async function removeProfile(id: string): Promise<void> {
  if (id === "default" || id === "guest" || (await activeProfile()).id === id) throw new Error("Switch away from this profile before deleting it.");
  await db.transaction("rw", db.profiles, db.profileSnapshots, async () => {
    await db.profiles.delete(id);
    await db.profileSnapshots.bulkDelete(PROFILE_TABLES.map((name) => `${id}:${name}`));
  });
}

/** Switch only small personal tables; the book and image library stays shared. */
export async function switchProfile(targetId: string): Promise<void> {
  const from = await activeProfile();
  if (from.id === targetId) return;
  const target = targetId === "guest"
    ? { id: "guest", name: "Guest", createdAt: Date.now(), guest: true }
    : await db.profiles.get(targetId) ?? (targetId === DEFAULT.id ? DEFAULT : undefined);
  if (!target) throw new Error("Profile not found.");
  const tables = PROFILE_TABLES.map((name) => db.table(name));
  await db.transaction("rw", [...tables, db.profileSnapshots, db.profiles, db.meta], async () => {
    if (!from.guest) {
      for (const name of PROFILE_TABLES) {
        await db.profileSnapshots.put({ key: `${from.id}:${name}`, rows: await db.table(name).toArray() });
      }
    }
    for (const name of PROFILE_TABLES) {
      const table = db.table(name);
      await table.clear();
      if (!target.guest) {
        const snapshot = await db.profileSnapshots.get(`${target.id}:${name}`);
        if (snapshot?.rows.length) await table.bulkPut(snapshot.rows as Record<string, unknown>[]);
      }
    }
    if (from.guest) await db.profiles.delete("guest");
    if (target.guest) await db.profiles.put(target);
    await setMeta("profile:active", target.id);
  });
  if (typeof sessionStorage !== "undefined") {
    if (target.guest) sessionStorage.setItem("neuroquiz.guestSession", "1");
    else sessionStorage.removeItem("neuroquiz.guestSession");
  }
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("neuroquiz-profile");
    channel.postMessage(target.id);
    channel.close();
  }
  // Invalidate all live queries and in-memory session state after the atomic swap.
  location.reload();
}

/** A guest session lasts only for the current browser session. */
export async function resumeProfile(): Promise<StudyProfile> {
  const profile = await activeProfile();
  if (profile.guest && typeof sessionStorage !== "undefined" && !sessionStorage.getItem("neuroquiz.guestSession")) {
    await switchProfile("default");
    return DEFAULT;
  }
  return profile;
}

/** Keep flags, issues, notes and the shared book content while starting scores over. */
export async function resetProfileStats(): Promise<void> {
  const syncDeletions = (await activeProfile()).id === "default";
  await db.transaction("rw", db.questionStates, db.cardStates, db.sessions, db.tombstones, async () => {
    await db.questionStates.toCollection().modify((s) => {
      s.timesSeen = 0;
      s.timesCorrect = 0;
      delete s.lastCorrect;
      delete s.lastSeenAt;
      delete s.lastConfidence;
      s.srs = newSrs();
      s.updatedAt = Date.now();
    });
    await db.cardStates.toCollection().modify((s) => {
      s.srs = newSrs();
      s.updatedAt = Date.now();
    });
    const ids = await db.sessions.toCollection().primaryKeys();
    await db.sessions.clear();
    if (syncDeletions) {
      await db.tombstones.bulkPut(ids.map((id) => ({ key: `sessions:${id}`, table: "sessions" as const, id: String(id), updatedAt: Date.now() })));
    }
  });
}
