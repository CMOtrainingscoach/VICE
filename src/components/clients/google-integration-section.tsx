"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ListItem = {
  id: string;
  title: string;
  subtitle?: string;
};

type Props = {
  title: string;
  description: string;
  connected: boolean;
  accountEmail: string;
  selectedId: string | null;
  selectedLabel: string | null;
  lastError: string;
  connectHref: string;
  callbackPathLabel: string;
  connectButtonLabel: string;
  emptyListMessage: string;
  selectPrompt: string;
  selectedMessage: (label: string) => string;
  disconnectedMessage: string;
  initialFlash?: string | null;
  flashMessages: Record<string, string>;
  reloadKey: string;
  onLoadList: () => Promise<{ ok: true; data: ListItem[] } | { ok: false; error: string }>;
  onSelect: (item: ListItem) => Promise<{ ok: boolean; error?: string }>;
  onDisconnect: () => Promise<{ ok: boolean; error?: string }>;
};

export function GoogleIntegrationSection({
  title,
  description,
  connected,
  accountEmail,
  selectedId,
  selectedLabel,
  lastError,
  connectHref,
  callbackPathLabel,
  connectButtonLabel,
  emptyListMessage,
  selectPrompt,
  selectedMessage,
  disconnectedMessage,
  initialFlash,
  flashMessages,
  reloadKey,
  onLoadList,
  onSelect,
  onDisconnect,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    initialFlash ? flashMessages[initialFlash] ?? null : null,
  );
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void (async () => {
      const result = await onLoadList();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.data);
    })();
    return () => {
      cancelled = true;
    };
    // reloadKey bumps when server status changes after OAuth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, reloadKey]);

  async function selectItem(item: ListItem) {
    setBusy("select");
    setError(null);
    const result = await onSelect(item);
    setBusy("");
    if (!result.ok) {
      setError(result.error ?? "Selectie mislukt");
      return;
    }
    setMessage(selectedMessage(item.title));
    router.refresh();
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    const result = await onDisconnect();
    setBusy("");
    if (!result.ok) {
      setError(result.error ?? "Ontkoppelen mislukt");
      return;
    }
    setItems([]);
    setMessage(disconnectedMessage);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-vice-text">{title}</h3>
          <p className="mt-1 max-w-prose text-sm text-vice-text-muted">{description}</p>
        </div>
        {connected ? (
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
            Gekoppeld
          </span>
        ) : (
          <span className="rounded-md bg-vice-bg px-2 py-1 text-xs font-medium text-vice-text-muted">
            Niet gekoppeld
          </span>
        )}
      </div>

      {message ? <p className="mt-4 text-sm text-vice-text">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {lastError ? <p className="mt-2 text-sm text-red-700">{lastError}</p> : null}

      {!connected ? (
        <div className="mt-5">
          <a
            href={connectHref}
            className="inline-flex rounded-md bg-vice-gold px-4 py-2 text-sm font-medium text-white hover:bg-vice-gold-hover"
          >
            {connectButtonLabel}
          </a>
          <p className="mt-3 text-xs text-vice-text-muted">
            Redirect-URI: <code className="text-[11px]">{callbackPathLabel}</code>
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-vice-text-muted">
            Account: <span className="text-vice-text">{accountEmail || "onbekend"}</span>
          </p>
          {selectedId && selectedLabel ? (
            <p className="text-sm text-vice-text">{selectedMessage(selectedLabel)}</p>
          ) : (
            <p className="text-sm text-amber-800">{selectPrompt}</p>
          )}

          {items.length > 0 ? (
            <ul className="divide-y divide-vice-border rounded-md border border-vice-border">
              {items.map((item) => {
                const active = item.id === selectedId;
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-vice-text">{item.title}</p>
                      {item.subtitle ? (
                        <p className="text-xs text-vice-text-muted">{item.subtitle}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant={active ? "secondary" : "primary"}
                      disabled={busy !== "" || active}
                      onClick={() => void selectItem(item)}
                    >
                      {active ? "Geselecteerd" : busy === "select" ? "Bezig…" : "Gebruik deze"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-vice-text-muted">{emptyListMessage}</p>
          )}

          <Button type="button" variant="ghost" disabled={busy !== ""} onClick={() => void disconnect()}>
            {busy === "disconnect" ? "Bezig…" : "Ontkoppelen"}
          </Button>
        </div>
      )}
    </section>
  );
}
