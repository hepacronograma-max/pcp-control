import { NextRequest, NextResponse } from "next/server";
import { assertPackagingCompanyAccess } from "@/lib/packaging/access";
import { loadShippingList } from "@/lib/packaging/shipping-list";
import { downloadDriveFile } from "@/lib/google-drive/cargo-photo";
import { isUuid } from "@/lib/utils/is-uuid";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId || !isUuid(orderId)) {
    return NextResponse.json({ error: "orderId inválido" }, { status: 400 });
  }
  const gate = await assertPackagingCompanyAccess(companyId, {
    requireSettings: false,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const list = await loadShippingList(gate.admin, orderId);
  const path = list?.cargo_photo_path ?? "";
  if (!path.startsWith("drive:")) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }
  try {
    const file = await downloadDriveFile(path.slice("drive:".length));
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=120",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao ler a foto." },
      { status: 500 }
    );
  }
}
