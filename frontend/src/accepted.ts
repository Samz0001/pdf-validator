import { load, save } from "./storage";
import type { Issue } from "./types";

const KEY = "pdfv.accepted";

/** Stable across runs: the same difference found again gets the same fingerprint. */
export const fingerprint = (i: Issue) => `${i.category}|${i.message}|${i.expected ?? ""}|${i.actual ?? ""}`;

export const loadAccepted = () => new Set(load<string[]>(KEY, []));
export const saveAccepted = (s: Set<string>) => save(KEY, Array.from(s));
