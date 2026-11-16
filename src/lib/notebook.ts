import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import commonplace from "../../content/commonplace.json";
import { KEYS, hasStore, store } from "./store";
import type { NotebookItem } from "./types";

// The notebook is copyrighted newsletter content, so it never goes in git.
// Production reads it from the store (`pnpm notebook:push` puts it there);
// local dev reads content/private/notebook.json; with neither, the paper
// prints from the small commonplace book that ships in the repo.

type Notebook = { items: NotebookItem[] };

let memo: { at: number; items: NotebookItem[] } | null = null;
const TEN_MINUTES = 600_000;

export async function getNotebook(): Promise<NotebookItem[]> {
  if (memo && Date.now() - memo.at < TEN_MINUTES) return memo.items;
  const newsletter = (await fromStore()) ?? (await fromFile());
  const items = newsletter ? newsletter.map(credit) : (commonplace.items as NotebookItem[]);
  memo = { at: Date.now(), items };
  return memo.items;
}

async function fromStore(): Promise<NotebookItem[] | null> {
  if (!hasStore) return null;
  try {
    const nb = await store.get<Notebook>(KEYS.notebook);
    return nb?.items?.length ? nb.items : null;
  } catch (err) {
    console.error("[notebook] store read failed", err);
    return null;
  }
}

async function fromFile(): Promise<NotebookItem[] | null> {
  try {
    const file = path.join(process.cwd(), "content/private/notebook.json");
    const nb = JSON.parse(await readFile(file, "utf8")) as Notebook;
    return nb.items?.length ? nb.items : null;
  } catch {
    return null;
  }
}

/** Ideas and questions in the newsletter are James Clear's own; say so. */
function credit(item: NotebookItem): NotebookItem {
  return item.author ? item : { ...item, author: "James Clear", source: "3-2-1" };
}
