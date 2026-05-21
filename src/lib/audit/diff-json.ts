export function diffJsonKeys(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
): { key: string; oldVal: string; newVal: string }[] {
  const oldO = oldData ?? {};
  const newO = newData ?? {};
  const keys = new Set([...Object.keys(oldO), ...Object.keys(newO)]);
  const rows: { key: string; oldVal: string; newVal: string }[] = [];
  for (const key of [...keys].sort()) {
    const o = JSON.stringify(oldO[key] ?? null);
    const n = JSON.stringify(newO[key] ?? null);
    if (o !== n) {
      rows.push({
        key,
        oldVal: o,
        newVal: n,
      });
    }
  }
  return rows;
}

export function eventsToCsv(
  events: Array<{
    created_at: string;
    table_name: string;
    action: string;
    record_id: string;
    user_email: string | null;
  }>
): string {
  const header = "created_at,table_name,action,record_id,user_email";
  const lines = events.map((e) =>
    [
      e.created_at,
      e.table_name,
      e.action,
      e.record_id,
      e.user_email ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}
