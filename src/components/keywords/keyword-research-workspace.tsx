"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GoogleAdsPublicStatus } from "@/lib/integrations/google-ads";
import type { KeywordResearchRow, KeywordResearchRun } from "@/lib/keywords/types";
import {
  listKeywordResearchAction,
  runKeywordResearchAction,
  suggestKeywordSeedsAction,
} from "@/modules/keywords/actions";

export function KeywordResearchWorkspace({
  tenantId,
  tenantName,
  adsStatus,
  initialRun,
  initialRows,
}: {
  tenantId: string;
  tenantName: string;
  adsStatus: GoogleAdsPublicStatus;
  initialRun: KeywordResearchRun | null;
  initialRows: KeywordResearchRow[];
}) {
  const [country, setCountry] = useState<"BE" | "NL">(
    initialRun?.countryCode === "NL" ? "NL" : "BE",
  );
  const [scope, setScope] = useState<"national" | "local">(initialRun?.scope ?? "national");
  const [city, setCity] = useState(initialRun?.city ?? "");
  const [seeds, setSeeds] = useState<string[]>(initialRun?.seedTerms ?? []);
  const [seedInput, setSeedInput] = useState("");
  const [run, setRun] = useState(initialRun);
  const [rows, setRows] = useState(initialRows);
  const [minVolume, setMinVolume] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRun(initialRun);
    setRows(initialRows);
  }, [initialRun, initialRows]);

  const filteredRows = useMemo(
    () => rows.filter((row) => row.avgMonthlySearches >= minVolume),
    [rows, minVolume],
  );

  async function loadSeeds() {
    setBusy("seeds");
    setError("");
    const result = await suggestKeywordSeedsAction(tenantId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Seeds laden mislukt" : result.error);
      return;
    }
    setSeeds(result.data.seeds);
    setNotice("Seed-termen voorgesteld op basis van audit en merk.");
  }

  function addSeed() {
    const term = seedInput.trim();
    if (!term) return;
    setSeeds((prev) => [...new Set([...prev, term])].slice(0, 15));
    setSeedInput("");
  }

  async function runResearch() {
    setBusy("run");
    setError("");
    setNotice("");
    const result = await runKeywordResearchAction(tenantId, {
      countryCode: country,
      scope,
      city: scope === "local" ? city : undefined,
      seeds,
    });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Onderzoek mislukt" : result.error);
      return;
    }
    setRun(result.data.run);
    setRows(result.data.rows);
    setNotice(`${result.data.rows.length} keywords opgeslagen.`);
  }

  async function reloadList() {
    const result = await listKeywordResearchAction(tenantId, { minVolume, limit: 300 });
    if (!result.ok || !result.data) return;
    setRun(result.data.run);
    setRows(result.data.rows);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">Klanten / {tenantName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-vice-text md:text-3xl">Zoekwoorden</h1>
      <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
        Keyword Planner via Google Ads (opgeslagen per run). Geen live Google-opvraging bij scrollen.
      </p>

      {!adsStatus.configured ? (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Google Ads nog niet geconfigureerd</p>
          <p className="mt-1">
            In hetzelfde Google Cloud-project als GOOGLE_CLIENT_ID/SECRET: schakel de Google Ads API in en
            stel Test- of Explorer-toegang in via Google Ads API → Overview in Cloud Console. Zet
            GOOGLE_ADS_CUSTOMER_ID en GOOGLE_ADS_REFRESH_TOKEN (OAuth met adwords-scope). Een developer token
            is niet meer nodig; GOOGLE_ADS_DEVELOPER_TOKEN is optioneel (legacy).
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-xl border border-vice-border bg-vice-surface p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-vice-text-muted">Land</span>
          <select
            className="w-full rounded-md border border-vice-border bg-vice-surface px-2 py-2 text-sm"
            value={country}
            onChange={(e) => setCountry(e.target.value as "BE" | "NL")}
          >
            <option value="BE">België</option>
            <option value="NL">Nederland</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-vice-text-muted">Bereik</span>
          <select
            className="w-full rounded-md border border-vice-border bg-vice-surface px-2 py-2 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as "national" | "local")}
          >
            <option value="national">Nationaal</option>
            <option value="local">Lokaal (stad)</option>
          </select>
        </label>
        {scope === "local" ? (
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-vice-text-muted">Stad</span>
            <input
              className="w-full rounded-md border border-vice-border px-2 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="bv. Antwerpen"
            />
          </label>
        ) : null}
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium text-vice-text">Seed-termen</h2>
          <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => void loadSeeds()}>
            {busy === "seeds" ? "Bezig…" : "Stel seeds voor (AI)"}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {seeds.map((seed) => (
            <span
              key={seed}
              className="inline-flex items-center gap-1 rounded-full border border-vice-border px-2 py-1 text-xs"
            >
              {seed}
              <button
                type="button"
                className="text-vice-text-muted hover:text-vice-text"
                onClick={() => setSeeds((prev) => prev.filter((s) => s !== seed))}
                aria-label={`Verwijder ${seed}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[12rem] flex-1 rounded-md border border-vice-border px-2 py-2 text-sm"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="Handmatige seed"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSeed();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addSeed}>
            Toevoegen
          </Button>
          <Button
            type="button"
            disabled={busy !== "" || seeds.length === 0 || !adsStatus.configured}
            onClick={() => void runResearch()}
          >
            {busy === "run" ? "Zoeken…" : "Zoek keywords"}
          </Button>
        </div>
      </section>

      {notice ? <p className="mt-4 text-sm text-emerald-800 dark:text-emerald-300">{notice}</p> : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-vice-text">Resultaten</h2>
            {run ? (
              <p className="text-xs text-vice-text-muted" suppressHydrationWarning>
                Laatste run: {new Date(run.createdAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}
                {" · "}
                {run.scope === "local" && run.city ? `${run.city}, ` : ""}
                {run.countryCode}
              </p>
            ) : (
              <p className="text-xs text-vice-text-muted">Nog geen opgeslagen run.</p>
            )}
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-vice-text-muted">Min. volume</span>
            <input
              type="number"
              min={0}
              className="w-28 rounded-md border border-vice-border px-2 py-1.5 text-sm"
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
              onBlur={() => void reloadList()}
            />
          </label>
        </div>

        {filteredRows.length === 0 ? (
          <p className="mt-4 text-sm text-vice-text-muted">Geen keywords om te tonen.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-vice-border text-left text-xs text-vice-text-muted">
                  <th className="px-2 py-2">Keyword</th>
                  <th className="px-2 py-2">Volume/mnd</th>
                  <th className="px-2 py-2">Competitie</th>
                  <th className="px-2 py-2">CPC €</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id || row.keyword} className="border-b border-vice-border/60">
                    <td className="px-2 py-2">{row.keyword}</td>
                    <td className="px-2 py-2 tabular-nums">{row.avgMonthlySearches.toLocaleString("nl-BE")}</td>
                    <td className="px-2 py-2">{row.competition}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.cpcLow != null || row.cpcHigh != null
                        ? `${row.cpcLow ?? "?"} – ${row.cpcHigh ?? "?"}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/klanten/${tenantId}/content/blog?keyword=${encodeURIComponent(row.keyword)}`}
                        className="text-vice-gold hover:underline"
                      >
                        Blog →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
