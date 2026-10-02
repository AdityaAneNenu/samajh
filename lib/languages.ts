/**
 * Languages a reader can ask for an explanation in.
 *
 * Kept deliberately small and explicit: each entry is a language we can name
 * honestly. Adding one is a one-line change; nothing else in the app needs to
 * know the list.
 */
export const LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", nativeLabel: "اُردُو" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as unknown as [
  LanguageCode,
  ...LanguageCode[],
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function languageLabel(code: string): string {
  const found = LANGUAGES.find((l) => l.code === code);
  return found ? found.label : code;
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === "string" && LANGUAGES.some((l) => l.code === value)
  );
}