
import { useStore } from "./store";
import ko from "../messages/ko.json";
import en from "../messages/en.json";

const messages = { ko, en } as const;
type Locale = keyof typeof messages;
type Messages = (typeof messages)["ko"];

export function useT(namespace: keyof Messages) {
  const locale = useStore((s) => s.locale) as Locale;
  // ko를 캐노니컬 스키마로 사용. en에 없는 키는 런타임에 undefined로 떨어지고
  // useT 함수 내부의 `val ?? key` fallback이 키 문자열을 그대로 반환한다.
  // (v2.2 한국어 카피 가이드 적용 — en은 v0.6.x 이후 동기화 예정)
  const ns = (messages[locale] as typeof ko)[namespace] as Record<string, string>;

  return (key: string, params?: Record<string, string | number>): string => {
    const val = ns[key] ?? key;
    if (!params) return val;
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  };
}
