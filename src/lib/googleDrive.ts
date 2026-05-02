// Google Drive API 유틸 — AlbumContainer + FolderUpload + Upload 공용
// §16: 분석 단계는 썸네일(800px)만 받고, 결제/확정 후 원본 다운로드

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY as string;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  // §16 단계화 다운로드를 위한 메타데이터
  thumbnailLink?: string;   // Drive가 생성한 썸네일 URL (=s{n} 접미사 조정 가능)
  hasThumbnail?: boolean;   // Drive 처리 완료 여부
  size?: string;            // 원본 파일 크기(bytes), 절감량 계산용
  modifiedTime?: string;
}

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

// §16: thumbnailLink, hasThumbnail, size, modifiedTime 추가 요청
export async function listDriveFolder(folderId: string, token: string): Promise<DriveFileItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (${MIME_Q})`);
  const fields = "files(id,name,mimeType,thumbnailLink,hasThumbnail,size,modifiedTime)";
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${encodeURIComponent(fields)}&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.files ?? [];
}

// §16: 썸네일 다운로드 (분석 단계용, 800px)
// Drive thumbnailLink 형식: https://lh3.googleusercontent.com/...=s220
// =s{n} 접미사를 target size로 교체해 더 큰 썸네일 획득
export async function downloadDriveThumbnail(
  item: DriveFileItem,
  token: string,
  size = 800,
): Promise<File | null> {
  if (!item.hasThumbnail || !item.thumbnailLink) return null;
  const url = /=s\d+$/.test(item.thumbnailLink)
    ? item.thumbnailLink.replace(/=s\d+$/, `=s${size}`)
    : `${item.thumbnailLink}=s${size}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], item.name, { type: blob.type || item.mimeType || "image/jpeg" });
  } catch {
    return null;
  }
}

// §16: 원본 다운로드 (결제/선택 확정 후)
export async function downloadDriveOriginal(item: DriveFileItem, token: string): Promise<File> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive 원본 다운로드 실패: ${item.name}`);
  const blob = await res.blob();
  return new File([blob], item.name, { type: item.mimeType || "image/jpeg" });
}

// 하위 호환 alias — 원본 다운로드
export const downloadDriveFile = downloadDriveOriginal;

export function isDriveAvailable(): boolean {
  return Boolean(CLIENT_ID && API_KEY);
}
