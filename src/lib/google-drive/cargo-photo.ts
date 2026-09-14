import { readFileSync, existsSync } from "fs";
import path from "path";
import { JWT } from "google-auth-library";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";

export function getGoogleDriveFolderId(): string {
  return (
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ||
    "1efM8M3QlnPo0hI1I0c9UJcUYxCJQ-GCj"
  );
}

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

function loadServiceAccount(): ServiceAccount {
  const rawEnv = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawEnv) {
    return JSON.parse(rawEnv) as ServiceAccount;
  }
  const file =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE?.trim() ||
    "google-drive-service-account.json";
  const abs = path.isAbsolute(file)
    ? file
    : path.join(process.cwd(), file);
  if (!existsSync(abs)) {
    throw new Error(
      "Falta google-drive-service-account.json (ou GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON na Vercel)."
    );
  }
  return JSON.parse(readFileSync(abs, "utf8")) as ServiceAccount;
}

async function driveAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  if (!sa.client_email || !sa.private_key) {
    throw new Error("JSON da conta de serviço Google incompleto.");
  }
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [DRIVE_SCOPE],
  });
  const token = await jwt.getAccessToken();
  if (!token.token) throw new Error("Google Drive: sem access token.");
  return token.token;
}

export type DriveUploadResult = {
  fileId: string;
  viewUrl: string;
};

export async function uploadCargoPhotoToDrive(opts: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  previousFileId?: string | null;
}): Promise<DriveUploadResult> {
  const folderId = getGoogleDriveFolderId();
  const token = await driveAccessToken();

  if (opts.previousFileId && /^[a-zA-Z0-9_-]+$/.test(opts.previousFileId)) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(opts.previousFileId)}?supportsAllDrives=true`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    ).catch(() => undefined);
  }

  const metadata = JSON.stringify({
    name: opts.fileName,
    parents: [folderId],
  });
  const boundary = "pcp_drive_boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${opts.contentType}\r\n\r\n`
    ),
    opts.buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const json = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Google Drive HTTP ${res.status}`);
  }
  return {
    fileId: json.id,
    viewUrl: `/api/expedicao/foto?fileId=${encodeURIComponent(json.id)}`,
  };
}

export async function downloadDriveFile(fileId: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    throw new Error("fileId inválido");
  }
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Google Drive leitura HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}
