"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleDocsPublicStatus } from "@/lib/integrations/google-docs";
import { DriveFolderPanel } from "@/components/documents/drive-folder-panel";
import {
  checkGoogleDriveWriteAccessAction,
  clearGoogleDriveProjectFolderAction,
  getGoogleDocsStatusAction,
} from "@/modules/integrations/google-docs-actions";

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
  const [canWrite, setCanWrite] = useState<boolean | null>(null);
  const [showFullDrive, setShowFullDrive] = useState(!initialStatus.projectFolderId);

  const reauthHref = `/api/integrations/google-docs/connect?tenantId=${encodeURIComponent(tenantId)}`;

  useEffect(() => {
    if (!initialStatus.connected) return;
    void (async () => {
      const result = await checkGoogleDriveWriteAccessAction(tenantId);
      if (result.ok) setCanWrite(result.data?.canWrite ?? false);
    })();
  }, [initialStatus.connected, tenantId]);

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

  const projectRoot = status.projectFolderId
    ? {
        id: status.projectFolderId,
        name: status.projectFolderName?.trim() || "Projectmap",
      }
    : null;

  return (
    <div className="space-y-6">
      {canWrite === false ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Alleen leestoegang op Google Drive</p>
          <p className="mt-1">
            Uploaden en mappen aanmaken vereist schrijftoegang. Je kunt wel bestanden in de projectmap bekijken.
          </p>
          <p className="mt-3 flex flex-wrap gap-3">
            <a
              href={reauthHref}
              className="inline-flex rounded-md bg-vice-gold px-3 py-1.5 text-sm font-medium text-white hover:bg-vice-gold-hover"
            >
              Autoriseer opnieuw
            </a>
            <Link href={settingsHref} className="inline-flex items-center text-sm font-medium text-vice-gold hover:underline">
              Instellingen
            </Link>
          </p>
        </div>
      ) : null}

      <p className="text-xs text-vice-text-muted">
        Account: {status.accountEmail || "—"}
        {status.lastError ? (
          <span className="block text-red-700 dark:text-red-300">{status.lastError}</span>
        ) : null}
      </p>

      {projectRoot ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Star className="size-4 text-vice-gold" aria-hidden />
              <span className="font-medium text-vice-text">Projectmap voor AI en documenten</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setShowFullDrive((v) => !v)}
              >
                {showFullDrive ? "Verberg hele Drive" : "Bladeren in hele Drive"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  void (async () => {
                    const result = await clearGoogleDriveProjectFolderAction(tenantId);
                    if (result.ok && result.data) {
                      setStatus(result.data);
                      setShowFullDrive(true);
                    }
                  })();
                }}
              >
                Wis projectmap
              </Button>
            </div>
          </div>

          <DriveFolderPanel
            key={projectRoot.id}
            tenantId={tenantId}
            root={projectRoot}
            title={projectRoot.name}
            description="Bestanden in deze map zie je hieronder. Upload rechtstreeks naar de projectmap (of een submap)."
            canWrite={canWrite}
            externalUrl={status.projectFolderUrl}
          />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-vice-border bg-vice-surface p-4 text-sm text-vice-text-muted">
          <p className="font-medium text-vice-text">Nog geen projectmap</p>
          <p className="mt-1">
            Blader in je Drive hieronder, open een map en kies <strong>Als projectmap</strong>. Daarna kun je die map
            in VICE openen, bestanden uploaden en de inhoud bekijken.
          </p>
        </div>
      )}

      {showFullDrive || !projectRoot ? (
        <DriveFolderPanel
          tenantId={tenantId}
          root={{ id: "root", name: "Mijn Drive" }}
          title="Bladeren in Google Drive"
          description={
            projectRoot
              ? "Kies een andere map als projectmap of beheer bestanden buiten de projectmap."
              : "Kies een map als projectmap voor deze klant."
          }
          canWrite={canWrite}
          showSetAsProject
          onProjectFolderSet={() => {
            void (async () => {
              const result = await getGoogleDocsStatusAction(tenantId);
              if (result.ok && result.data) {
                setStatus(result.data);
                setShowFullDrive(false);
              }
            })();
          }}
        />
      ) : null}

      <p className="text-xs text-vice-text-muted">
        Google Docs bewerk je in Google (knop openen). Problemen met uploaden?{" "}
        <Link href={settingsHref} className="text-vice-gold hover:underline">
          Instellingen
        </Link>
        .
      </p>
    </div>
  );
}
