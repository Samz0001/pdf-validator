import type { Batch, Job, Options, Reference } from "./types";

/** Either an uploaded file or the id of a reference saved in the library. */
export type RefSource = File | { id: string; name: string };

const fail = async (r: Response, what: string) => {
  const detail = (await r.json().catch(() => ({}))).detail;
  return new Error(typeof detail === "string" ? detail : `${what} failed (${r.status})`);
};

function appendRef(fd: FormData, ref: RefSource) {
  if (ref instanceof File) fd.append("reference", ref);
  else fd.append("reference_id", ref.id);
}

export async function createJob(reference: RefSource, candidate: File, options: Options): Promise<Job> {
  const fd = new FormData();
  appendRef(fd, reference);
  fd.append("candidate", candidate);
  fd.append("options", JSON.stringify(options));
  const r = await fetch("/api/jobs", { method: "POST", body: fd });
  if (!r.ok) throw await fail(r, "Upload");
  return r.json();
}

export async function rerunJob(id: string, options: Options): Promise<Job> {
  const r = await fetch(`/api/jobs/${id}/rerun`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options),
  });
  if (!r.ok) throw await fail(r, "Re-run");
  return r.json();
}

export async function createBatch(reference: RefSource, candidates: File[], options: Options): Promise<Batch> {
  const fd = new FormData();
  appendRef(fd, reference);
  candidates.forEach((c) => fd.append("candidates", c));
  fd.append("options", JSON.stringify(options));
  const r = await fetch("/api/batch", { method: "POST", body: fd });
  if (!r.ok) throw await fail(r, "Batch upload");
  return r.json();
}

export async function getBatch(id: string): Promise<Batch> {
  const r = await fetch(`/api/batch/${id}`);
  if (!r.ok) throw new Error(r.status === 404 ? "Batch not found" : `Request failed (${r.status})`);
  return r.json();
}

export async function listReferences(): Promise<Reference[]> {
  const r = await fetch("/api/references");
  if (!r.ok) throw await fail(r, "Loading library");
  return r.json();
}

export async function saveReference(file: File, name?: string): Promise<Reference> {
  const fd = new FormData();
  fd.append("file", file);
  if (name) fd.append("name", name);
  const r = await fetch("/api/references", { method: "POST", body: fd });
  if (!r.ok) throw await fail(r, "Saving reference");
  return r.json();
}

export async function deleteReference(id: string): Promise<void> {
  const r = await fetch(`/api/references/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw await fail(r, "Delete");
}

export async function getJob(id: string): Promise<Job> {
  const r = await fetch(`/api/jobs/${id}`);
  if (!r.ok) throw new Error(r.status === 404 ? "Job not found" : `Request failed (${r.status})`);
  return r.json();
}

export const fileUrl = (id: string, name: string, download = false) =>
  `/api/jobs/${id}/files/${name}${download ? "?download=true" : ""}`;

export async function createDemo(): Promise<Job> {
  const r = await fetch("/api/demo", { method: "POST" });
  if (!r.ok) throw new Error(`Could not start demo (${r.status})`);
  return r.json();
}

export async function getStats(): Promise<import("./types").Stats> {
  const r = await fetch("/api/stats");
  if (!r.ok) throw new Error(`Could not load dashboard (${r.status})`);
  return r.json();
}

export async function deleteJob(id: string): Promise<void> {
  const r = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`Delete failed (${r.status})`);
}

export async function getHistory(limit = 200): Promise<import("./types").RecentJob[]> {
  const r = await fetch(`/api/history?limit=${limit}`);
  if (!r.ok) throw new Error(`Could not load history (${r.status})`);
  return r.json();
}

export async function health(): Promise<boolean> {
  try {
    return (await fetch("/api/health")).ok;
  } catch {
    return false;
  }
}
