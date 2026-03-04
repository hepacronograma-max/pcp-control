import { redirect } from "next/navigation";

export default function HomePage() {
  // FASE 0: placeholder simples.
  // Em fases futuras, vamos redirecionar para login ou dashboard baseado em auth.
  redirect("/login");
}

