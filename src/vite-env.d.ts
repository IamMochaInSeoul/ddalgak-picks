/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Google (Drive 연동)
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;

  // Supabase
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // 분석
  readonly VITE_GA_MEASUREMENT_ID: string;

  // 기능 플래그
  readonly VITE_ADSENSE_CLIENT_ID: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_FEATURE_PAYMENT: string;
  readonly VITE_FEATURE_PERSON_CLUSTERING: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_FACE_EMBEDDING_MODEL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
