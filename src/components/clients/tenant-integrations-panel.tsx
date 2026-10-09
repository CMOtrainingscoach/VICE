"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { BloggerBlog, BloggerPublicStatus } from "@/lib/integrations/blogger";
import {
  disconnectBloggerAction,
  listTenantBloggerBlogsAction,
  selectBloggerBlogAction,
} from "@/modules/integrations/blogger-actions";

const BLOGGER_FLASH: Record<string, string> = {
  connected: "Google Blogger is gekoppeld. Kies hieronder welke blog je wilt gebruiken.",
  denied: "Google-autorisatie geannuleerd.",
  invalid: "Ongeldige OAuth-callback.",
  state: "OAuth-sessie verlopen. Probeer opnieuw te koppelen.",
  token: "Tokenuitwisseling met Google mislukt.",
  save: "Koppeling opslaan mislukt. Controleer of migratie 20260330135100 is toegepast.",
  "not-configured": "Zet GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET in de omgeving.",
  forbidden: "Geen toegang tot deze koppeling.",
};

export function TenantIntegrationsPanel({
  tenantId,
  initialBlogger,
  bloggerFlash,
}: {
  tenantId: string;
  initialBlogger: BloggerPublicStatus;
  bloggerFlash?: string | null;
}) {
  const router = useRouter();
  const [blogger, setBlogger] = useState(initialBlogger);
  const [blogs, setBlogs] = useState<BloggerBlog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    bloggerFlash ? BLOGGER_FLASH[bloggerFlash] ?? null : null,
  );
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setBlogger(initialBlogger);
  }, [initialBlogger]);

  useEffect(() => {
    if (!blogger.connected) return;
    let cancelled = false;
    void (async () => {
      const result = await listTenantBloggerBlogsAction(tenantId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBlogs(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [blogger.connected, tenantId]);

  async function selectBlog(blog: BloggerBlog) {
    setBusy("select");
    setError(null);
    const result = await selectBloggerBlogAction(tenantId, blog);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) setBlogger(result.data);
    setMessage(`Blog «${blog.name}» is geselecteerd voor publicatie.`);
    router.refresh();
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    const result = await disconnectBloggerAction(tenantId);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBlogger({
      connected: false,
      status: "disconnected",
      accountEmail: "",
      blogId: null,
      blogName: null,
      blogUrl: null,
      lastError: "",
    });
    setBlogs([]);
    setMessage("Google Blogger ontkoppeld.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Sitekoppelingen</h2>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Koppel externe sites van deze klant zodat gegenereerde content automatisch kan worden gepubliceerd.
        </p>
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-medium text-vice-text">Google Blogger</h3>
            <p className="mt-1 max-w-prose text-sm text-vice-text-muted">
              Publiceer blogposts vanuit VICE rechtstreeks naar de Blogger-site van de klant.
            </p>
          </div>
          {blogger.connected ? (
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
        {blogger.lastError ? (
          <p className="mt-2 text-sm text-red-700">{blogger.lastError}</p>
        ) : null}

        {!blogger.connected ? (
          <div className="mt-5">
            <a
              href={`/api/integrations/blogger/connect?tenantId=${encodeURIComponent(tenantId)}`}
              className="inline-flex rounded-md bg-vice-gold px-4 py-2 text-sm font-medium text-white hover:bg-vice-gold-hover"
            >
              Koppel Google Blogger
            </a>
            <p className="mt-3 text-xs text-vice-text-muted">
              Je wordt doorgestuurd naar Google om toegang tot Blogger te geven. Redirect-URI:
              {" "}
              <code className="text-[11px]">/api/integrations/blogger/callback</code>
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-vice-text-muted">
              Account: <span className="text-vice-text">{blogger.accountEmail || "onbekend"}</span>
            </p>
            {blogger.blogId ? (
              <p className="text-sm text-vice-text">
                Actieve blog:{" "}
                <strong>{blogger.blogName ?? blogger.blogId}</strong>
                {blogger.blogUrl ? (
                  <>
                    {" "}
                    (
                    <a href={blogger.blogUrl} target="_blank" rel="noreferrer" className="underline">
                      openen
                    </a>
                    )
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-amber-800">Kies hieronder welke Blogger-site VICE mag gebruiken.</p>
            )}

            {blogs.length > 0 ? (
              <ul className="divide-y divide-vice-border rounded-md border border-vice-border">
                {blogs.map((blog) => {
                  const active = blog.id === blogger.blogId;
                  return (
                    <li key={blog.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-vice-text">{blog.name}</p>
                        {blog.url ? (
                          <p className="text-xs text-vice-text-muted">{blog.url}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant={active ? "secondary" : "primary"}
                        disabled={busy !== "" || active}
                        onClick={() => void selectBlog(blog)}
                      >
                        {active ? "Geselecteerd" : busy === "select" ? "Bezig…" : "Gebruik deze blog"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-vice-text-muted">Geen blogs gevonden op dit Google-account.</p>
            )}

            <Button
              type="button"
              variant="ghost"
              disabled={busy !== ""}
              onClick={() => void disconnect()}
            >
              {busy === "disconnect" ? "Bezig…" : "Ontkoppelen"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
