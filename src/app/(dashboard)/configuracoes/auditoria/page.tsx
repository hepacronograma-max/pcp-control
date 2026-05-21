import { redirect } from "next/navigation";

/** Rota legada → painel completo de auditoria. */
export default function AuditoriaRedirectPage() {
  redirect("/admin/audit");
}
