
import { useStore } from "./store";
import ko from "../messages/ko.json";
import en from "../messages/en.json";

const messages = { ko, en } as const;
type Locale = keyof typeof messages;
type Messages = (typeof messages)["ko"];

export function useT(namespace: keyof Messages) {
  const locale = useStore((s) => s.locale) as Locale;
  const ns = messages[locale][namespace] as Record<string, string>;

  return (key: string, params?: Record<string, string | number>): string => {
    const val = ns[key] ?? key;
    if (!params) return val;
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  };
}
