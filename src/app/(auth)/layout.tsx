import type { ReactNode } from "react";

/** Layout do grupo (auth) — sem html/body (já no layout raiz). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
