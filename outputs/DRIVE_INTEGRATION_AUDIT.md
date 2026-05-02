# Google Drive 연동 아키텍처 점검 보고서

> 작성일: 2026-05-02  
> 대상 커밋: `1c68db8` (feat(drive+zip): Upload.tsx Drive 연동 + ZIP 진행률 표시)  
> 점검 방법: 읽기/grep만 — 코드 변경 없음

---

## 1. 진입점별 Drive 연동 현황

| 진입점 | 파일 | Drive 버튼 노출 조건 | 다운로드 방식 | driveQueue 사용 |
|--------|------|---------------------|--------------|----------------|
| Flow A — 단일 업로드 | `Upload.tsx` | `isDriveAvailable()` | **동기(블로킹)** | ❌ 없음 |
| Flow B — 폴더 묶음 | `FolderUpload.tsx` | `isDriveAvailable()` | **비동기(fire-and-forget)** | ✅ 사용 |
| Flow C — 앨범 | `AlbumContainer.tsx` | 직접 `GOOGLE_CLIENT_ID && API_KEY` 체크 | **동기(블로킹)** | ❌ 없음 |
| Landing | `Landing.tsx` | 없음 | — | — |

`isDriveAvailable()` (`src/lib/googleDrive.ts:104`) = `Boolean(CLIENT_ID && API_KEY)`

---

## 2. 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────────────────┐
│  src/lib/googleDrive.ts  (공용 Drive 유틸)                            │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │ getGoogleAccess  │  │  openDrivePicker()   │  │listDriveFolder│  │
│  │    Token()       │  │  (Folder | Files)    │  │ downloadDrive │  │
│  │  GIS OAuth2.0    │  │  Google Picker API   │  │    File()     │  │
│  └──────────────────┘  └──────────────────────┘  └───────────────┘  │
│   ↑ import.meta.env.VITE_GOOGLE_CLIENT_ID / API_KEY                  │
└──────────────────────────────────────────────────────────────────────┘
          ↑ import                ↑ import                ↑ import
          │                       │                        │
┌─────────┴──────┐    ┌──────────┴──────────┐    ┌───────┴────────────┐
│ Upload.tsx     │    │ FolderUpload.tsx     │    │ AlbumContainer.tsx │
│ (Flow A)       │    │ (Flow B)             │    │ (Flow C)           │
│                │    │                      │    │                    │
│ driveTokenRef  │    │ 매번 새 토큰 요청    │    │ driveToken(state)  │
│ (useRef, 컴포  │    │ (재사용 없음)        │    │ (컴포 수명 재사용) │
│ 넌트 수명)     │    │                      │    │                    │
│ 다운로드: 직접 │    │ 다운로드:            │    │ 다운로드: 직접     │
│ fetch(alt=media│    │ downloadDriveFile()  │    │ downloadDriveFile()│
│ 인라인 구현)   │    │ + driveQueue 큐등록  │    │ 동기 완료 대기     │
│                │    │                      │    │                    │
│ driveQueue ❌  │    │ driveQueue ✅ 사용   │    │ driveQueue ❌      │
└────────────────┘    └──────────────────────┘    └────────────────────┘
                               ↓
                   ┌───────────────────────┐
                   │  Zustand store        │
                   │  driveQueue: [        │
                   │    { id, folderName,  │
                   │      status, current, │
                   │      total }          │
                   │  ]                    │
                   └───────────────────────┘
                               ↓
                   ┌───────────────────────┐
                   │ DriveDownloadBanner   │
                   │ (AppShell에서 전역    │
                   │  렌더링 — zIndex 8000)│
                   └───────────────────────┘
```

### 데이터 흐름 (Flow B 전체 — 가장 완전한 구현)

```
사용자 클릭
  → getGoogleAccessToken() [GIS OAuth — prompt:""]
  → openDrivePicker(token) [Google Picker API]
  → addDriveQueueItem(qid, "downloading")      ← 여기서 블로킹 해제, 사용자 자유
  → (async IIFE fire-and-forget)
      → listDriveFolder(folderId, token)
      → for each item: downloadDriveFile(item, token)  ← alt=media 원본 다운로드
          → updateDriveQueueItem(qid, { current: i+1 })
      → addFolderSession(makeSession(folderName, files, tag, count))
      → updateDriveQueueItem(qid, { status: "done" })
      → showToast() + Notification API
      → setTimeout(removeDriveQueueItem, 4000)
```

---

## 3. 썸네일(800px) vs 원본 단계화 — 미구현

### 명세 (TECH_SPEC §16 / v3 Plan PR #16)
> "분석 단계는 Drive 썸네일(800px)만 받고, 결제 후 원본 다운로드"

### 현재 구현
세 진입점 **모두** `alt=media`로 원본 풀 다운로드:

| 위치 | 코드 |
|------|------|
| `Upload.tsx:140` | `fetch(\`…/files/${item.id}?alt=media\`, …)` 인라인 |
| `FolderUpload.tsx` (→ `googleDrive.ts:95`) | `downloadDriveFile()` → `alt=media` |
| `AlbumContainer.tsx:391` (→ `googleDrive.ts:95`) | `downloadDriveFile()` → `alt=media` |

### 타입은 준비됨, 로직은 없음
`src/lib/types.ts:263-266`에 아래 필드가 정의되어 있으나 **어디서도 채워지지 않음**:

```typescript
driveFileId?: string;
driveThumbnailUrl?: string;    // Drive files.list의 thumbnailLink 값이 들어와야 함
driveOriginalUrl?: string;
isOriginalDownloaded?: boolean;
```

`listDriveFolder()` (`googleDrive.ts:84`)의 fields 파라미터:
```
fields=files(id,name,mimeType)   ← thumbnailLink 빠짐
```
800px 썸네일을 받으려면 `&fields=files(id,name,mimeType,thumbnailLink)` + `sizeParam=800`이 필요하나 미구현.

---

## 4. 토큰 관리 패턴

| 컴포넌트 | 저장 방식 | 재사용 | 문제 |
|---------|----------|--------|------|
| `Upload.tsx` | `useRef<string\|null>` | ✅ 컴포넌트 수명 | 페이지 이동 후 소멸 |
| `FolderUpload.tsx` | 저장 없음 | ❌ 매번 새 OAuth | consent 화면 반복 가능성 |
| `AlbumContainer.tsx` | `useState<string\|null>` | ✅ 컴포넌트 수명 | 페이지 이동 후 소멸 |

`getGoogleAccessToken()` (`googleDrive.ts:31`):
```javascript
tokenClient.requestAccessToken({ prompt: "" })
// prompt:""이므로 이미 동의한 계정은 popup 없이 토큰 발급.
// 단, 컴포넌트 언마운트 후엔 어디서도 토큰이 살아있지 않음.
```

→ 전역 스토어나 sessionStorage에 토큰을 캐시하면 화면 이동 후 재동의 없이 연속 사용 가능.

---

## 5. OAuth 동의 화면 / 환경변수 패턴

### 환경변수 선언
```
src/vite-env.d.ts:5  →  VITE_GOOGLE_CLIENT_ID
src/vite-env.d.ts:6  →  VITE_GOOGLE_API_KEY
```

### 사용 불일치

| 파일 | 사용 방식 |
|------|----------|
| `googleDrive.ts` | `import.meta.env.VITE_GOOGLE_CLIENT_ID` (모듈 상단 상수) |
| `Upload.tsx` | `isDriveAvailable()` 호출 (googleDrive.ts 경유, 권장) |
| `FolderUpload.tsx` | `isDriveAvailable()` 호출 (권장) |
| `AlbumContainer.tsx:16-17` | 직접 `import.meta.env.VITE_GOOGLE_CLIENT_ID` 재선언 후 line 354 체크 |

→ AlbumContainer는 isDriveAvailable()을 쓰지 않고 직접 변수를 재선언하는 중복이 있음.

### 동의 화면 스코프
```
scope: "https://www.googleapis.com/auth/drive.readonly"
```
읽기 전용으로 최소 권한 원칙 준수. ✅

---

## 6. FolderSession.source 미설정 버그

`makeSession()` (`FolderUpload.tsx:62-76`):
```typescript
function makeSession(...): FolderSession {
  return {
    ...
    source: "local",   // ← Drive에서 가져온 경우에도 항상 "local"로 고정!
    // driveFolderId, driveFolderPath 미설정
  };
}
```

Drive 경로로 폴더를 가져온 경우에도 `source: "google_drive"`가 되어야 하고,  
`driveFolderId`, `driveFolderPath`가 채워져야 §16.3 명세를 만족하나 **전혀 채워지지 않음**.

---

## 7. 명세 vs 구현 격차 요약

| # | 명세 항목 | 구현 상태 | 심각도 |
|---|---------|----------|--------|
| 1 | 썸네일(800px) 우선 다운로드 | ❌ 미구현 — 원본 alt=media만 | **HIGH** |
| 2 | 결제 후 원본 다운로드 단계화 | ❌ 미구현 — 단계 없음 | **HIGH** |
| 3 | `driveThumbnailUrl / driveOriginalUrl` 활용 | ❌ 타입만 정의, 로직 없음 | HIGH |
| 4 | `FolderSession.source: "google_drive"` | ❌ 항상 "local" | MEDIUM |
| 5 | `driveFolderId / driveFolderPath` 채우기 | ❌ 미구현 | MEDIUM |
| 6 | 토큰 전역 캐시 | ❌ 컴포넌트별 로컬 관리 | MEDIUM |
| 7 | Flow A DriveQueue 통합 | ❌ Upload.tsx는 드래그앤드롭 중 UI 블로킹 | LOW |
| 8 | AlbumContainer isDriveAvailable() 미사용 | ⚠️ 직접 env 재선언 (중복) | LOW |
| 9 | listDriveFolder fields에 thumbnailLink 없음 | ❌ 미구현 | HIGH (prerequisite for #1) |

---

## 8. 즉시 실행 가능한 수정 방향

### P0 — 썸네일/원본 단계화 (§16 핵심 기능)

1. `listDriveFolder()` fields 확장:
   ```
   fields=files(id,name,mimeType,thumbnailLink,size)
   ```
2. `googleDrive.ts`에 `getDriveThumbnail(thumbnailLink, token)` 추가:
   - Drive API thumbnailLink는 인증된 URL → Authorization 헤더 필요
   - 또는 `files.get?fields=thumbnailLink&alt=media`로 800px blob 수신
3. 분석 파이프라인은 thumbnailLink URL로 `<img>` 렌더링 (blob 불필요)
4. ZIP/결제 완료 시 `isOriginalDownloaded: false` → `downloadDriveFile()` 호출로 원본 수신

### P1 — FolderSession.source 수정

`makeSession()`에 `source` 파라미터 추가:
```typescript
function makeSession(folderName, files, tag, count, source: "local"|"google_drive" = "local", driveFolderId?: string)
```
Drive 경로에서 호출 시 `source: "google_drive"`, `driveFolderId: picked.id` 전달.

### P2 — 토큰 전역 캐시

`store.ts`에 `driveToken: string | null` 추가 후 세 컴포넌트가 공유.  
`getGoogleAccessToken()`의 GIS 내부에도 토큰 만료 처리가 있으므로 단순 전역 저장으로 충분.

### P3 — Upload.tsx Drive 다운로드를 driveQueue로 마이그레이션

현재 `handleDriveImport` 내 인라인 fetch를 `downloadDriveFile()`로 교체하고,  
FolderUpload.tsx와 동일한 fire-and-forget 패턴으로 전환.

---

## 9. 현재 동작 요약 (2026-05-02 기준)

- Drive OAuth + Picker + 원본 다운로드 → 분석 파이프라인까지 **기본 흐름은 동작**
- Flow B(FolderUpload)만 백그라운드 큐 + DriveDownloadBanner가 완전히 붙어있음
- Flow A(Upload)는 동기식 블로킹, Flow C(AlbumContainer)도 동기식 블로킹
- 썸네일 단계화(§16 핵심)는 타입 정의만 존재, **실제 구현 없음**
- 모든 경우에 원본 전체 파일을 즉시 다운로드 → 대용량 폴더에서 UX 저하 위험
