"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderPlus,
  FilePlus,
  Upload,
  Trash2,
  Pencil,
  Star,
  ExternalLink,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DriveBrowseItem } from "@/lib/integrations/google-drive-api";
import type { GoogleDocsPublicStatus } from "@/lib/integrations/google-docs";
import {
  clearGoogleDriveProjectFolderAction,
  createDriveFolderAction,
  createGoogleDocumentAction,
  deleteDriveItemAction,
  listDriveFolderAction,
  renameDriveItemAction,
  setGoogleDriveProjectFolderAction,
  uploadDriveFileAction,
} from "@/modules/integrations/google-docs-actions";

type Crumb = { id: string; name: string };

function kindLabel(kind: DriveBrowseItem["kind"]): string {
  switch (kind) {
    case "folder":
      return "Map";
    case "document":
      return "Google Doc";
    case "spreadsheet":
      return "Spreadsheet";
    case "image":
      return "Afbeelding";
    case "file":
      return "Bestand";
    default:
      return "Item";
  }
}

export function GoogleDriveWorkspace({
  tenantId,
  settingsHref,
  initialStatus,
}: {
  tenantId: string;
  settingsHref: string;
  initialStatus: GoogleDocsPublicStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "Mijn Drive" }]);
  const [items, setItems] = useState<DriveBrowseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentFolderId = crumbs[crumbs.length - 1]?.id ?? "root";

  const loadFolder = useCallback(async (folderId: string) => {
    setLoading(true);
    setError("");
    const result = await listDriveFolderAction(tenantId, folderId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setItems([]);
      return;
    }
    setItems(result.data ?? []);
  }, [tenantId]);

  useEffect(() => {
    if (!initialStatus.connected) return;
    void loadFolder(currentFolderId);
  }, [initialStatus.connected, currentFolderId, loadFolder]);

  function openFolder(item: DriveBrowseItem) {
    if (item.kind !== "folder") return;
    setCrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  }

  function goToCrumb(index: number) {
    setCrumbs((prev) => prev.slice(0, index + 1));
  }

  async function refresh() {
    await loadFolder(currentFolderId);
  }

  if (!status.connected) {
    return (
      <div className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <p className="text-sm text-vice-text-muted">
          Google Drive is nog niet gekoppeld.{" "}
          <Link href={settingsHref} className="font-medium text-vice-gold hover:underline">
            Koppel in Instellingen
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-vice-border bg-vice-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Projectmap (AI)</p>
        {status.projectFolderId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Star className="size-4 text-vice-gold" aria-hidden />
            <span className="font-medium text-vice-text">{status.projectFolderName}</span>
            {status.projectFolderUrl ? (
              <a
                href={status.projectFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-vice-gold hover:underline"
              >
                Openen
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs"
              disabled={Boolean(busy)}
              onClick={() => {
                void (async () => {
                  setBusy("clear-project");
                  const result = await clearGoogleDriveProjectFolderAction(tenantId);
                  setBusy("");
                  if (result.ok && result.data) setStatus(result.data);
                })();
              }}
            >
              Wis selectie
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-vice-text-muted">
            Kies in de lijst hieronder een map → <strong>Als projectmap</strong>. VICE gebruikt die map later
            voor AI-scans (documenten, afbeeldingen, …).
          </p>
        )}
        <p className="mt-2 text-xs text-vice-text-muted">
          Account: {status.accountEmail || "—"}
          {status.lastError ? (
            <span className="block text-red-700 dark:text-red-300">{status.lastError}</span>
          ) : null}
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 text-sm text-vice-text-muted" aria-label="Pad">
        {crumbs.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
            <button
              type="button"
              className={
                index === crumbs.length - 1
                  ? "font-medium text-vice-text"
                  : "hover:text-vice-text hover:underline"
              }
              onClick={() => goToCrumb(index)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setShowNewFolder(true)}>
          <FolderPlus className="size-4" />
          Nieuwe map
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={() => {
            void (async () => {
              setBusy("doc");
              const result = await createGoogleDocumentAction(tenantId, currentFolderId, "Nieuw document");
              setBusy("");
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await refresh();
            })();
          }}
        >
          <FilePlus className="size-4" />
          Nieuw Google Doc
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void (async () => {
              setBusy("upload");
              setError("");
              const form = new FormData();
              form.set("file", file);
              const result = await uploadDriveFileAction(tenantId, currentFolderId, form);
              setBusy("");
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await refresh();
            })();
          }}
        />
      </div>

      {showNewFolder ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-vice-border bg-vice-surface p-3">
          <Input
            placeholder="Mapnaam"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="max-w-xs"
          />
          <Button
            type="button"
            disabled={Boolean(busy) || !newFolderName.trim()}
            onClick={() => {
              void (async () => {
                setBusy("folder");
                const result = await createDriveFolderAction(tenantId, currentFolderId, newFolderName);
                setBusy("");
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setNewFolderName("");
                setShowNewFolder(false);
                await refresh();
              })();
            }}
          >
            Aanmaken
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowNewFolder(false)}>
            Annuleren
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <div className="rounded-lg border border-vice-border bg-vice-surface">
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-vice-text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Drive laden…
          </p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-vice-text-muted">Deze map is leeg.</p>
        ) : (
          <ul className="divide-y divide-vice-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {item.kind === "folder" ? (
                    <button
                      type="button"
                      className="text-left text-sm font-medium text-vice-text hover:text-vice-gold"
                      onClick={() => openFolder(item)}
                    >
                      {item.name}
                    </button>
                  ) : (
                    <p className="truncate text-sm font-medium text-vice-text">{item.name}</p>
                  )}
                  <p className="text-xs text-vice-text-muted">{kindLabel(item.kind)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.kind === "folder" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        void (async () => {
                          setBusy(`project-${item.id}`);
                          const result = await setGoogleDriveProjectFolderAction(tenantId, {
                            id: item.id,
                            name: item.name,
                            webViewLink: item.webViewLink,
                          });
                          setBusy("");
                          if (result.ok && result.data) setStatus(result.data);
                          else if (!result.ok) setError(result.error);
                        })();
                      }}
                    >
                      <Star className="size-3.5" />
                      Als projectmap
                    </Button>
                  ) : null}
                  {item.webViewLink ? (
                    <a href={item.webViewLink} target="_blank" rel="noopener noreferrer">
                      <Button type="button" variant="ghost" className="h-8 px-2" aria-label="Openen in Google">
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2"
                    disabled={Boolean(busy)}
                    aria-label="Hernoemen"
                    onClick={() => {
                      const next = window.prompt("Nieuwe naam", item.name);
                      if (!next?.trim()) return;
                      void (async () => {
                        setBusy(`rename-${item.id}`);
                        const result = await renameDriveItemAction(tenantId, item.id, next);
                        setBusy("");
                        if (!result.ok) setError(result.error);
                        else await refresh();
                      })();
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-red-700 dark:text-red-300"
                    disabled={Boolean(busy)}
                    aria-label="Verwijderen"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `«${item.name}» naar prullenbak verplaatsen? Dit kan niet ongedaan via VICE.`,
                        )
                      ) {
                        return;
                      }
                      void (async () => {
                        setBusy(`del-${item.id}`);
                        const result = await deleteDriveItemAction(tenantId, item.id);
                        setBusy("");
                        if (!result.ok) setError(result.error);
                        else await refresh();
                      })();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-vice-text-muted">
        Bewerken van Google Docs gebeurt in Google (knop openen). Na een scope-wijziging: opnieuw koppelen in{" "}
        <Link href={settingsHref} className="text-vice-gold hover:underline">
          Instellingen
        </Link>
        .
      </p>
    </div>
  );
}
