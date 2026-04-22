
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
} from "./types";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_PET_WEIGHTS,
  DEFAULT_FILTERS,
} from "./types";

interface AppActions {
  setStep: (step: AppState["step"]) => void;
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
}

const initialState: AppState = {
  step: "landing",
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
};

export const useStore = create<AppState & AppActions>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
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
}));
