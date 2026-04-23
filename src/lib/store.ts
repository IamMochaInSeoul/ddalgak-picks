
import { create } from "zustand";
import type {
  AppState,
  PhotoEntry,
  PhotoGroup,
  PhotoType,
  AnalysisWeights,
  PetWeights,
  Filters,
  GroupScoreEntry,
  FolderSession,
  EventTag,
} from "./types";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_PET_WEIGHTS,
  DEFAULT_FILTERS,
} from "./types";
import type { PersistedSession } from "./sessionPersist";

interface AppActions {
  setStep: (step: AppState["step"]) => void;
  setFlow: (flow: AppState["flow"]) => void;
  setPhotoType: (type: PhotoType) => void;
  setPhotos: (photos: Map<string, PhotoEntry>) => void;
  setGroups: (groups: PhotoGroup[]) => void;
  setTargetCount: (n: number) => void;
  setMaxPerGroup: (n: number) => void;
  setWeights: (w: AnalysisWeights) => void;
  setPetWeights: (w: PetWeights) => void;
  setFilters: (f: Filters) => void;
  incrementReextract: () => void;
  resetReextract: () => void;
  setAnalysisProgress: (current: number, total: number, stage: string) => void;
  togglePhotoSelected: (photoId: string) => void;
  setGroupSelected: (groupId: string, photoId: string) => void;
  setLocale: (locale: "ko" | "en") => void;
  reset: () => void;

  // 취향 재추출 시스템
  setGroupScoresWithScene: (scores: GroupScoreEntry[]) => void;
  enterFeedbackMode: (samples: string[]) => void;
  exitFeedbackMode: () => void;
  addFeedback: (photoId: string, liked: boolean) => void;
  removeFeedback: (photoId: string) => void;
  setPreferenceResult: (weights: AnalysisWeights, selected: Set<string>) => void;
  clearPreference: () => void;
  dismissBanner: () => void;

  // 세션 복구
  restoreSession: (session: PersistedSession) => void;
  setFilesDetached: (v: boolean) => void;
  reattachFiles: (files: File[]) => void;

  // Flow B — 폴더 묶음 셀렉
  setFolderSessions: (sessions: FolderSession[]) => void;
  addFolderSession: (session: FolderSession) => void;
  updateFolderSession: (id: string, patch: Partial<FolderSession>) => void;
  removeFolderSession: (id: string) => void;
  setFolderSessionEventTag: (id: string, tag: EventTag) => void;
  setFolderSessionTargetCount: (id: string, n: number) => void;
}

const initialState: AppState = {
  step: "landing",
  flow: null,
  photoType: null,
  photos: new Map(),
  groups: [],
  targetCount: 30,
  maxPerGroup: 2,
  weights: DEFAULT_WEIGHTS,
  petWeights: DEFAULT_PET_WEIGHTS,
  filters: DEFAULT_FILTERS,
  reextractCount: 0,
  analysisProgress: 0,
  analysisStage: "",
  locale: "ko",
  // 취향 재추출
  groupScoresWithScene: [],
  feedbackMode: false,
  feedbackSamples: [],
  feedbackEntries: new Map(),
  preferenceWeights: null,
  preferenceSelected: null,
  bannerDismissed: false,

  // Flow B
  folderSessions: [],

  // 세션 지속성
  filesDetached: false,
};

export const useStore = create<AppState & AppActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setFlow: (flow) => set({ flow }),
  setPhotoType: (type) => set({ photoType: type }),
  setPhotos: (photos) => set({ photos }),
  setGroups: (groups) => set({ groups }),
  setTargetCount: (n) => set({ targetCount: n }),
  setMaxPerGroup: (n) => set({ maxPerGroup: n }),
  setWeights: (w) => set({ weights: w }),
  setPetWeights: (w) => set({ petWeights: w }),
  setFilters: (f) => set({ filters: f }),
  incrementReextract: () =>
    set((s) => ({ reextractCount: s.reextractCount + 1 })),
  resetReextract: () => set({ reextractCount: 0 }),
  setAnalysisProgress: (current, total, stage) =>
    set({ analysisProgress: total > 0 ? current / total : 0, analysisStage: stage }),

  togglePhotoSelected: (photoId) =>
    set((s) => {
      const photos = new Map(s.photos);
      const p = photos.get(photoId);
      if (p) {
        photos.set(photoId, { ...p, isSelected: !p.isSelected });
      }
      return { photos };
    }),

  setGroupSelected: (groupId, photoId) =>
    set((s) => {
      const photos = new Map(s.photos);
      const groups = s.groups.map((g) => {
        if (g.id !== groupId) return g;
        // Deselect all in group, select new
        for (const pid of g.photoIds) {
          const p = photos.get(pid);
          if (p) photos.set(pid, { ...p, isSelected: pid === photoId });
        }
        return { ...g, selectedId: photoId };
      });
      return { photos, groups };
    }),

  setLocale: (locale) => set({ locale }),

  reset: () => set({
    ...initialState,
    locale: (useStore.getState() as AppState & AppActions).locale,
  }),

  // 취향 재추출 액션
  setGroupScoresWithScene: (scores) => set({ groupScoresWithScene: scores }),

  enterFeedbackMode: (samples) => set({
    feedbackMode: true,
    feedbackSamples: samples,
    feedbackEntries: new Map(),
  }),

  exitFeedbackMode: () => set({ feedbackMode: false }),

  addFeedback: (photoId, liked) =>
    set((s) => {
      const entries = new Map(s.feedbackEntries);
      entries.set(photoId, liked);
      return { feedbackEntries: entries };
    }),

  removeFeedback: (photoId) =>
    set((s) => {
      const entries = new Map(s.feedbackEntries);
      entries.delete(photoId);
      return { feedbackEntries: entries };
    }),

  setPreferenceResult: (weights, selected) => set({
    preferenceWeights: weights,
    preferenceSelected: selected,
  }),

  clearPreference: () => set({
    preferenceWeights: null,
    preferenceSelected: null,
    feedbackEntries: new Map(),
    feedbackSamples: [],
  }),

  dismissBanner: () => set({ bannerDismissed: true }),

  // 세션 복구: IndexedDB에 저장된 썸네일+메타로 갤러리 상태 재구성
  restoreSession: (session) => {
    const photos = new Map<string, PhotoEntry>();
    for (const p of session.selectedPhotos) {
      // File 객체는 없으므로 null 대신 dummy (파일 재첨부 전까지 ZIP 불가)
      photos.set(p.id, {
        id: p.id,
        file: null as unknown as File,   // 재첨부 전까지 null
        hash: BigInt(0),
        groupId: "",
        score: { total: p.score } as PhotoEntry["score"],
        deductions: p.deductions as PhotoEntry["deductions"],
        confidence: p.confidence,
        thumbnail: p.thumbnail,
        isSelected: p.isSelected,
        faceDetected: true,
      });
    }
    set({
      step: "gallery",
      photoType: session.photoType as AppState["photoType"],
      targetCount: session.targetCount,
      locale: session.locale as AppState["locale"],
      photos,
      groups: [],
      filesDetached: true,
    });
  },

  setFilesDetached: (v) => set({ filesDetached: v }),

  // Flow B 액션
  setFolderSessions: (sessions) => set({ folderSessions: sessions }),
  addFolderSession: (session) =>
    set((s) => ({ folderSessions: [...s.folderSessions, session] })),
  updateFolderSession: (id, patch) =>
    set((s) => ({
      folderSessions: s.folderSessions.map((fs) =>
        fs.id === id ? { ...fs, ...patch } : fs
      ),
    })),
  removeFolderSession: (id) =>
    set((s) => ({
      folderSessions: s.folderSessions.filter((fs) => fs.id !== id),
    })),
  setFolderSessionEventTag: (id, tag) =>
    set((s) => ({
      folderSessions: s.folderSessions.map((fs) =>
        fs.id === id ? { ...fs, eventTag: tag } : fs
      ),
    })),
  setFolderSessionTargetCount: (id, n) =>
    set((s) => ({
      folderSessions: s.folderSessions.map((fs) =>
        fs.id === id ? { ...fs, targetCount: n } : fs
      ),
    })),

  // 파일 재첨부: 파일명 매칭으로 File 객체를 기존 PhotoEntry에 주입
  reattachFiles: (files) => {
    set((s) => {
      const byName = new Map<string, File>(files.map((f) => [f.name, f]));
      const photos = new Map(s.photos);
      let matched = 0;
      for (const [id, entry] of photos) {
        // id에서 파일명 추출 (저장 시 photo.file.name 기반)
        const stored = entry as PhotoEntry & { _filename?: string };
        const fname = stored._filename ?? entry.file?.name;
        if (fname && byName.has(fname)) {
          photos.set(id, { ...entry, file: byName.get(fname)! });
          matched++;
        }
      }
      return { photos, filesDetached: matched < photos.size };
    });
  },
}));
