import type { Profile, ProductionLine } from "@/lib/types/database";

export const LOCAL_USERS_KEY = "pcp-local-users";

export interface LocalUser extends Omit<Profile, "id"> {
  id: string;
  password: string;
  line_ids: string[];
}

export function getLocalUsers(): LocalUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalUsers(users: LocalUser[]) {
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

export function getLocalUsersAsProfiles(companyId: string): Profile[] {
  return getLocalUsers()
    .filter((u) => u.company_id === companyId && u.is_active)
    .map(({ password: _, line_ids: __, ...p }) => p);
}

export function findLocalUserByEmail(
  email: string,
  password: string
): Profile | null {
  const users = getLocalUsers();
  const user = users.find(
    (u) =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.password === password &&
      u.is_active
  );
  if (!user) return null;
  const { password: _, line_ids: __, ...profile } = user;
  return profile;
}

export function createLocalUser(data: {
  fullName: string;
  email: string;
  password: string;
  role: "pcp" | "operator";
  companyId: string;
  lineIds: string[];
}): LocalUser {
  const users = getLocalUsers();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const newUser: LocalUser = {
    id,
    company_id: data.companyId,
    full_name: data.fullName.trim(),
    email: data.email.trim(),
    password: data.password,
    role: data.role,
    is_active: true,
    created_at: now,
    updated_at: now,
    line_ids: data.lineIds ?? [],
  };
  users.push(newUser);
  setLocalUsers(users);
  return newUser;
}

export function toggleLocalUserActive(userId: string, active: boolean): boolean {
  const users = getLocalUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return false;
  users[idx].is_active = active;
  users[idx].updated_at = new Date().toISOString();
  setLocalUsers(users);
  return true;
}

export function getOperatorLineIdsForLocalUser(userId: string): string[] {
  const users = getLocalUsers();
  const user = users.find((u) => u.id === userId);
  return user?.line_ids ?? [];
}

export function getLocalUserWithLines(
  companyId: string,
  allLines: ProductionLine[]
): (Profile & { lines: ProductionLine[] })[] {
  const users = getLocalUsers().filter((u) => u.company_id === companyId);
  return users.map((u) => {
    const { password: _, line_ids, ...p } = u;
    const lines = line_ids
      .map((id) => allLines.find((l) => l.id === id))
      .filter(Boolean) as ProductionLine[];
    return { ...p, lines };
  });
}
