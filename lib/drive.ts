import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import {
  getUserById,
  insertRun,
  insertGymSession,
  getImportedFileIds,
  getImportedGymFileIds,
  getRunStartKeys,
  getGymStartKeys,
  findGymSessionAwaitingWatchData,
  mergeWatchDataIntoGymSession,
  touchDriveSync,
} from "./db";
import { parseActivityFile, runNameFromFile, gymNameFromFile } from "./ingest";
import { guessGymType } from "./gym";

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
export async function accessToken(): Promise<string> {
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
  imported: { id: number; name: string; kind: "run" | "gym" }[];
  skipped: number;
  errors: { file: string; error: string }[];
  // Health Metrics sheet sync (when the runner has linked one).
  health?: { daysUpdated: number; error?: string };
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
  const [runIds, gymIds, runStartKeys, gymStartKeys] = await Promise.all([
    getImportedFileIds(userId),
    getImportedGymFileIds(userId),
    getRunStartKeys(userId),
    getGymStartKeys(userId),
  ]);
  // A Drive file should be imported once, whether it landed as a run or a gym
  // session, so skip if either table already has it.
  const importedIds = new Set([...runIds, ...gymIds]);
  const result = {
    imported: [] as { id: number; name: string; kind: "run" | "gym" }[],
    skipped: 0,
    errors: [] as { file: string; error: string }[],
  };

  for (const f of files) {
    if (importedIds.has(f.id)) {
      result.skipped++;
      continue;
    }
    try {
      const buf = await downloader(f.id);
      const parsed = parseActivityFile(f.name, buf);
      // Normalize to UTC to match the start-key sets (DB times come back as UTC).
      const key = new Date(parsed.summary.startedAt).toISOString().slice(0, 19);

      if (parsed.kind === "gym") {
        if (gymStartKeys.has(key)) {
          result.skipped++;
          continue;
        }
        // A pasted Strong workout may already hold this session's exercises —
        // fill in the watch data instead of creating a duplicate.
        const pending = await findGymSessionAwaitingWatchData(userId, parsed.summary.startedAt);
        if (pending) {
          const merged = await mergeWatchDataIntoGymSession(userId, pending.id, parsed.summary, f.id);
          if (merged) {
            gymStartKeys.add(key);
            result.imported.push({ id: merged.id, name: merged.name, kind: "gym" });
            continue;
          }
        }
        const name = gymNameFromFile(f.name, parsed.summary.startedAt);
        const type = guessGymType(parsed.summary.sport, parsed.summary.subSport);
        const session = await insertGymSession(
          userId,
          { name, type, rpe: parsed.summary.rpe, notes: null },
          parsed.summary,
          f.id
        );
        gymStartKeys.add(key);
        result.imported.push({ id: session.id, name: session.name, kind: "gym" });
      } else {
        if (runStartKeys.has(key)) {
          result.skipped++;
          continue; // same run already exists (e.g. uploaded manually)
        }
        const name = runNameFromFile(f.name, parsed.summary.startedAt);
        const run = await insertRun(userId, name, parsed.summary, f.id);
        runStartKeys.add(key);
        result.imported.push({ id: run.id, name: run.name, kind: "run" });
      }
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
  if (!user || (!user.driveFolderId && !user.healthSheetId)) return base;
  base.folderSet = !!user.driveFolderId;

  if (
    !opts.force &&
    user.driveLastSync &&
    Date.now() - new Date(user.driveLastSync).getTime() < THROTTLE_MS
  ) {
    return { ...base, throttled: true };
  }

  await touchDriveSync(userId); // stamp first to throttle concurrent visits
  const health = await syncHealth(user, !!opts.force);
  if (!user.driveFolderId) return { ...base, health };
  try {
    const files = await listFolderFiles(user.driveFolderId);
    const res = await importDriveFiles(userId, files);
    return { ...base, ...res, health };
  } catch (e) {
    return { ...base, health, error: e instanceof Error ? e.message : "Drive sync failed." };
  }
}

// Piggyback the Health Metrics sheet on every activity sync. A sheet failure
// never fails the sync — it's reported alongside. Forced syncs (the Settings
// button) backfill the sheet's full history; routine auto-syncs only rewrite
// recent days to stay cheap.
async function syncHealth(
  user: { id: number; healthSheetId: string | null },
  full = false
): Promise<SyncResult["health"]> {
  if (!user.healthSheetId) return undefined;
  try {
    const { syncHealthSheet } = await import("./healthSheet");
    const res = await syncHealthSheet(user.id, user.healthSheetId, full ? Infinity : 14);
    return { daysUpdated: res.daysUpdated };
  } catch (e) {
    return { daysUpdated: 0, error: e instanceof Error ? e.message : "Health sync failed." };
  }
}
