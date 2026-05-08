import type { Profile } from "@/lib/types/database";
import type { TaskAssigneeOption } from "@/lib/types/tasks";

/** Garante que o utilizador atual aparece na lista de atribuição (ex.: perfil só em sessão). */
export function mergeProfileIntoAssigneeOptions(
  assignees: TaskAssigneeOption[],
  profile: Profile
): TaskAssigneeOption[] {
  const map = new Map<string, TaskAssigneeOption>();
  for (const a of assignees) {
    map.set(a.id, a);
  }
  if (!map.has(profile.id)) {
    const name = (profile.full_name ?? "").trim() || profile.email?.trim() || "Eu";
    const email = profile.email?.trim();
    map.set(profile.id, {
      id: profile.id,
      full_name: name,
      email: email || undefined,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "pt", { sensitivity: "base" })
  );
}

export function assigneeOptionLabel(a: TaskAssigneeOption): string {
  const e = a.email?.trim();
  if (e) return `${a.full_name} (${e})`;
  return a.full_name;
}
