import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { GarminConnect } from "@flow-js/garmin-connect";
import { getGarminToken, setGarminToken, touchGarminSync, getUserById } from "./db";
import { importDriveFiles, type DriveFile, type SyncResult } from "./drive";

const THROTTLE_MS = 5 * 60 * 1000; // auto-sync at most this often
const ACTIVITY_LIMIT = 20; // how many recent activities to scan per sync

// --- auth / session ---

// Log in with Garmin credentials and return the session token JSON to persist.
// The password is used only here and never stored. Throws a user-facing error
// on bad credentials or (currently unsupported) MFA-gated accounts.
export async function loginAndExportToken(email: string, password: string): Promise<string> {
  const gc = new GarminConnect({ username: email, password });
  await gc.login();
  return JSON.stringify(gc.exportToken());
}

// Rebuild a client from a stored token (oauth1 + oauth2). The library refreshes
// the short-lived oauth2 token automatically using oauth1 when needed.
function clientFromToken(tokenJson: string): GarminConnect {
  const { oauth1, oauth2 } = JSON.parse(tokenJson);
  const gc = new GarminConnect();
  gc.loadToken(oauth1, oauth2);
  return gc;
}

// --- activity download ---

// Download one activity's ORIGINAL file (a .zip containing the .fit) and return
// the FIT bytes. The library writes to a directory, so we use a throwaway temp
// dir (works on Vercel's /tmp) and unzip in memory.
async function downloadActivityFit(gc: GarminConnect, activityId: number): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), "garmin-"));
  try {
    await gc.downloadOriginalActivityData({ activityId }, dir, "zip");
    const zip = readFileSync(join(dir, `${activityId}.zip`));
    const entries = unzipSync(new Uint8Array(zip));
    const fitName = Object.keys(entries).find((n) => /\.fit$/i.test(n));
    if (!fitName) throw new Error("No FIT file in the Garmin download");
    return Buffer.from(entries[fitName]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- sync ---

export type GarminSyncResult = SyncResult;

// Pull recent Garmin activities and import any new ones, reusing the Drive
// import pipeline (dedupe by source id + start time, parse FIT, insert). Each
// activity is tagged `garmin:<id>` as its source_file_id so it won't re-import
// and won't collide with Drive file ids.
export async function syncUserGarmin(
  userId: number,
  opts: { force?: boolean } = {}
): Promise<GarminSyncResult> {
  const base: GarminSyncResult = {
    configured: false,
    folderSet: false,
    imported: [],
    skipped: 0,
    errors: [],
  };

  const tokenJson = await getGarminToken(userId);
  if (!tokenJson) return base; // not connected
  base.configured = true;
  base.folderSet = true;

  const user = await getUserById(userId);
  if (
    !opts.force &&
    user?.garminLastSync &&
    Date.now() - new Date(user.garminLastSync).getTime() < THROTTLE_MS
  ) {
    return { ...base, throttled: true };
  }

  try {
    await touchGarminSync(userId); // stamp first to throttle concurrent visits
    const gc = clientFromToken(tokenJson);
    const activities = await gc.getActivities(0, ACTIVITY_LIMIT);

    const files: DriveFile[] = activities.map((a) => ({
      id: `garmin:${a.activityId}`,
      name: `${a.activityId}.fit`,
      modifiedTime: a.startTimeGMT,
    }));
    const downloader = (id: string) =>
      downloadActivityFit(gc, Number(id.replace(/^garmin:/, "")));

    const res = await importDriveFiles(userId, files, downloader);

    // The client may have refreshed its oauth2 token during the calls — persist
    // the latest so the session stays valid across syncs.
    try {
      await setGarminToken(userId, JSON.stringify(gc.exportToken()));
    } catch {
      /* keep the existing token if re-export fails */
    }

    return { ...base, ...res };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Garmin sync failed." };
  }
}
