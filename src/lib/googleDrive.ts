// Google Drive API 유틸 — AlbumContainer + FolderUpload 공용

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY as string;

export interface DriveFileItem { id: string; name: string; mimeType: string }

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export async function getGoogleAccessToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    const tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (response: { error?: string; access_token: string }) => {
        if (response.error) { reject(new Error(response.error)); return; }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export type PickerResult =
  | { type: "folder"; id: string; name: string }
  | { type: "files"; items: DriveFileItem[] };

export async function openDrivePicker(token: string): Promise<PickerResult> {
  await loadScript("https://apis.google.com/js/api.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return new Promise((resolve, reject) => {
    w.gapi.load("picker", () => {
      const g = w.google;
      const imageMimes = "image/jpeg,image/png,image/heic,image/webp,image/avif,image/tiff";
      const picker = new g.picker.PickerBuilder()
        .addView(
          new g.picker.DocsView(g.picker.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes("application/vnd.google-apps.folder"),
        )
        .addView(
          new g.picker.DocsView()
            .setMimeTypes(imageMimes)
            .setMode(g.picker.DocsViewMode.GRID),
        )
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .setCallback((data: any) => {
          if (data.action === g.picker.Action.PICKED) {
            const docs = data.docs as DriveFileItem[];
            if (docs[0]?.mimeType === "application/vnd.google-apps.folder") {
              resolve({ type: "folder", id: docs[0].id, name: docs[0].name });
            } else {
              resolve({ type: "files", items: docs });
            }
          } else if (data.action === g.picker.Action.CANCEL) {
            reject(new Error("cancelled"));
          }
        })
        .build();
      picker.setVisible(true);
    });
  });
}

const IMAGE_MIMES = ["image/jpeg","image/png","image/heic","image/webp","image/avif","image/tiff"];
const MIME_Q = IMAGE_MIMES.map((m) => `mimeType='${m}'`).join(" or ");

export async function listDriveFolder(folderId: string, token: string): Promise<DriveFileItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (${MIME_Q})`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.files ?? [];
}

export async function downloadDriveFile(item: DriveFileItem, token: string): Promise<File> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive 다운로드 실패: ${item.name}`);
  const blob = await res.blob();
  return new File([blob], item.name, { type: item.mimeType || "image/jpeg" });
}

export function isDriveAvailable(): boolean {
  return Boolean(CLIENT_ID && API_KEY);
}
