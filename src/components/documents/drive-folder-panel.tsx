"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  FilePlus,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DriveBrowseItem } from "@/lib/integrations/google-drive-api";
import {
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

export function DriveFolderPanel({
  tenantId,
  root,
  title,
  description,
  canWrite,
  showSetAsProject,
  onProjectFolderSet,
  externalUrl,
}: {
  tenantId: string;
  root: { id: string; name: string };
  title: string;
  description?: string;
  canWrite: boolean | null;
  showSetAsProject?: boolean;
  onProjectFolderSet?: () => void;
  externalUrl?: string | null;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([root]);
  const [items, setItems] = useState<DriveBrowseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentFolderId = crumbs[crumbs.length - 1]?.id ?? root.id;

  useEffect(() => {
    setCrumbs([root]);
  }, [root.id, root.name]);

  const loadFolder = useCallback(
    async (folderId: string) => {
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
    },
    [tenantId],
  );

  useEffect(() => {
    void loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  async function refresh() {
    await loadFolder(currentFolderId);
  }

  function openFolder(item: DriveBrowseItem) {
    if (item.kind !== "folder") return;
    setCrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  }

  function goToCrumb(index: number) {
    setCrumbs((prev) => prev.slice(0, index + 1));
  }

  const writeDisabled = canWrite === false || Boolean(busy);

  return (
    <section
      id={showSetAsProject ? undefined : "vice-project-folder"}
      className="rounded-lg border border-vice-border bg-vice-surface"
    >
      <div className="border-b border-vice-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-vice-text">{title}</h2>
            {description ? <p className="mt-1 text-sm text-vice-text-muted">{description}</p> : null}
          </div>
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-vice-gold hover:underline"
            >
              Open in Google Drive
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>

        <nav className="mt-3 flex flex-wrap items-center gap-1 text-sm text-vice-text-muted" aria-label="Pad">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.id}-${index}`} className="flex items-center gap-1">
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

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={writeDisabled}
            onClick={() => setShowNewFolder(true)}
          >
            <FolderPlus className="size-4" />
            Nieuwe map
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={writeDisabled}
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
          <Button
            type="button"
            variant="secondary"
            disabled={writeDisabled}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = "";
              if (!files?.length) return;
              void (async () => {
                setBusy("upload");
                setError("");
                for (const file of Array.from(files)) {
                  const form = new FormData();
                  form.set("file", file);
                  const result = await uploadDriveFileAction(tenantId, currentFolderId, form);
                  if (!result.ok) {
                    setError(result.error);
                    break;
                  }
                }
                setBusy("");
                await refresh();
              })();
            }}
          />
        </div>

        {showNewFolder ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              placeholder="Mapnaam"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              disabled={writeDisabled || !newFolderName.trim()}
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

        {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      </div>

      <div>
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-vice-text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Bestanden laden…
          </p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-vice-text-muted">Deze map is leeg. Upload bestanden of maak een submap.</p>
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
                  {showSetAsProject && item.kind === "folder" ? (
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
                          if (result.ok) onProjectFolderSet?.();
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
                    disabled={writeDisabled}
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
                    disabled={writeDisabled}
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
    </section>
  );
}
