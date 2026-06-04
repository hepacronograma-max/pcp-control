import { NextRequest, NextResponse } from "next/server";
import { importarPedidosDaFabricacao } from "@/lib/omie/sync-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron diário — importação Omie etapa Fabricação (somente leitura no Omie).
 * Protegido por X-Cron-Secret (mesmo padrão de outros crons do projeto).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado" },
      { status: 503 }
    );
  }

  const key =
    request.headers.get("x-cron-secret") ||
    request.headers.get("X-Cron-Secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (key !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  try {
    const report = await importarPedidosDaFabricacao();
    if (report.skipped_reason === "locked") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "locked",
        report,
      });
    }
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/omie-import-diario]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
