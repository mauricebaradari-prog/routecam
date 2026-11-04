/**
 * Markiert einen deutschen Text in einer Konstanten-Tabelle als übersetzbar, ohne ihn zu übersetzen
 * (die Tabelle entsteht beim Laden, die Sprache kann später wechseln). Angezeigt wird er mit t(label).
 * Eigene Datei, damit Module wie settings.ts sie ohne Ringabhängigkeit zu i18n.tsx nutzen können.
 */
export const k = (de: string) => de;
