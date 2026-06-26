import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import {
  getUserById,
  insertRun,
  getImportedFileIds,
  getRunStartKeys,
  touchDriveSync,
} from "./db";
import { parseRunFile, runNameFromFile } from "./ingest";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const THROTTLE_MS = 5 * 60 * 1000; // auto-sync at most this often

type Creds = { clientEmail: string; privateKey: string };

let _credsCache: Creds | null | undefined;

// Load service-account creds from either GOOGLE_SERVICE_ACCOUNT_JSON (raw or
// base64 JSON) or a GOOGLE_APPLICATION_CREDENTIALS file path.
function loadCreds(): Creds | null {
  if (_credsCache !== undefined) return _credsCache;
  let parsed: { client_email?: string; private_key?: string } | null = null;

  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    let raw = inline;
    if (!raw.startsWith("{")) {
      try {
        raw = Buffer.from(raw, "base64").toString("utf8");
      } catch {
        /* not base64 */
      }
    }
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* invalid */
    }
  }
  if (!parsed && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      parsed = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    } catch {
      /* unreadable */
    }
  }

  if (parsed?.client_email && parsed?.private_key) {
    _credsCache = {
      clientEmail: parsed.client_email,
      // Tolerate keys pasted with escaped newlines.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } else {
    _credsCache = null;
  }
  return _credsCache;
}

export function isDriveConfigured(): boolean {
  return loadCreds() !== null;
}

export function serviceAccountEmail(): string | null {
  return loadCreds()?.clientEmail ?? null;
}

// Accept a raw folder id or a Drive folder URL and return the id.
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

let _jwt: JWT | null = null;
async function accessToken(): Promise<string> {
  const creds = loadCreds();
  if (!creds) throw new Error("Google Drive is not configured on the server.");
  if (!_jwt) {
    _jwt = new JWT({ email: creds.clientEmail, key: creds.privateKey, scopes: [DRIVE_SCOPE] });
  }
  const { token } = await _jwt.getAccessToken();
  if (!token) throw new Error("Could not obtain a Google access token.");
  return token;
}

export type DriveFile = { id: string; name: string; modifiedTime: string };

export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await accessToken();
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${query}` +
    `&fields=files(id,name,modifiedTime)&pageSize=1000&orderBy=modifiedTime` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) throw new Error("Folder not found, or not shared with the service account.");
    throw new Error(`Drive listing failed (${res.status}). ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { files?: DriveFile[] };
  return (data.files ?? []).filter((f) => /\.(fit|csv)$/i.test(f.name));
}

export async function downloadFile(id: string): Promise<Buffer> {
  const token = await accessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive download failed for ${id} (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export type SyncResult = {
  configured: boolean;
  folderSet: boolean;
  throttled?: boolean;
  imported: { id: number; name: string }[];
  skipped: number;
  errors: { file: string; error: string }[];
  error?: string;
};

// Import a set of Drive files, skipping ones already imported (by Drive file
// id) or whose run already exists (by start time). Downloader is injectable
// for testing.
export async function importDriveFiles(
  userId: number,
  files: DriveFile[],
  downloader: (id: string) => Promise<Buffer> = downloadFile
): Promise<Pick<SyncResult, "imported" | "skipped" | "errors">> {
  const [importedIds, startKeys] = await Promise.all([
    getImportedFileIds(userId),
    getRunStartKeys(userId),
  ]);
  const result = { imported: [] as { id: number; name: string }[], skipped: 0, errors: [] as { file: string; error: string }[] };

  for (const f of files) {
    if (importedIds.has(f.id)) {
      result.skipped++;
      continue;
    }
    try {
      const buf = await downloader(f.id);
      const summary = parseRunFile(f.name, buf);
      // Normalize to UTC to match getRunStartKeys (DB times come back as UTC).
      const key = new Date(summary.startedAt).toISOString().slice(0, 19);
      if (startKeys.has(key)) {
        result.skipped++;
        continue; // same run already exists (e.g. uploaded manually)
      }
      const name = runNameFromFile(f.name, summary.startedAt);
      const run = await insertRun(userId, name, summary, f.id);
      startKeys.add(key);
      result.imported.push({ id: run.id, name: run.name });
    } catch (e) {
      result.errors.push({ file: f.name, error: e instanceof Error ? e.message : "parse failed" });
    }
  }
  return result;
}

export async function syncUserDrive(
  userId: number,
  opts: { force?: boolean } = {}
): Promise<SyncResult> {
  const base: SyncResult = { configured: isDriveConfigured(), folderSet: false, imported: [], skipped: 0, errors: [] };
  if (!base.configured) return base;

  const user = await getUserById(userId);
  if (!user?.driveFolderId) return base;
  base.folderSet = true;

  if (
    !opts.force &&
    user.driveLastSync &&
    Date.now() - new Date(user.driveLastSync).getTime() < THROTTLE_MS
  ) {
    return { ...base, throttled: true };
  }

  try {
    await touchDriveSync(userId); // stamp first to throttle concurrent visits
    const files = await listFolderFiles(user.driveFolderId);
    const res = await importDriveFiles(userId, files);
    return { ...base, ...res };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Drive sync failed." };
  }
}
