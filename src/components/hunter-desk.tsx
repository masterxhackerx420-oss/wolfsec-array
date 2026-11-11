import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Radar, Search } from "lucide-react";
import { CATEGORY_LABEL, ENGINES } from "@/lib/hunt/catalog";
import { runHunt } from "@/lib/hunt/hunt.functions";
import type { Category, Hit, HuntMode, HuntResponse, Mention } from "@/lib/hunt/types";

const RECENT_KEY = "wolfsec-array-recent";

type Recent = { query: string; mode: HuntMode };

const EXAMPLES: { label: string; query: string; mode: HuntMode }[] = [
  { label: "debian", query: "debian", mode: "hunt" },
  { label: "openssl", query: "openssl", mode: "hunt" },
  { label: "debian.org", query: "debian.org", mode: "hunt" },
  { label: "@torvalds", query: "torvalds", mode: "username" },
];

function enginesFor(mode: HuntMode) {
  return ENGINES.filter((engine) => engine.modes.includes(mode));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hunt";
}

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(hits: Hit[]) {
  const head = ["engine", "category", "title", "url", "host", "mention", "snippet"];
  const lines = hits.map((hit) =>
    [hit.engineLabel, hit.category, hit.title, hit.url, hit.host, hit.mention, hit.snippet]
      .map((cell) => `"${cell.replaceAll('"', '""')}"`)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

function toMarkdown(result: HuntResponse) {
  const lines = [
    `# WolfSec Array — ${result.query}`,
    "",
    `${result.hits.length} leads across ${result.engines.filter((engine) => engine.ok).length} indexes in ${result.tookMs} ms.`,
    "",
  ];
  for (const hit of result.hits) {
    lines.push(`- [${hit.title}](${hit.url}) — ${hit.engineLabel}`);
    if (hit.snippet) lines.push(`  ${hit.snippet}`);
  }
  return lines.join("\n");
}

function mentionLabel(mention: Mention) {
  if (mention === "none") return null;
  if (mention === "title") return "Mention in title";
  if (mention === "url") return "Mention in URL";
  return "Mention in snippet";
}

export function HunterDesk() {
  const hunt = useServerFn(runHunt);
  const [mode, setMode] = useState<HuntMode>("hunt");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(() => enginesFor("hunt").map((engine) => engine.id));
  const [result, setResult] = useState<HuntResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "mentions" | Category>("all");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Recent[];
      if (Array.isArray(stored)) setRecent(stored.slice(0, 6));
    } catch {
      setRecent([]);
    }
  }, []);

  const available = enginesFor(mode);
  const visibleHits = useMemo(() => {
    if (!result) return [];
    return result.hits.filter((hit) => {
      if (filter === "mentions") return hit.mention !== "none";
      if (filter === "all") return true;
      return hit.category === filter;
    });
  }, [result, filter]);

  const categories = useMemo(() => {
    const present = new Set(result?.hits.map((hit) => hit.category) ?? []);
    return [...present];
  }, [result]);

  function switchMode(next: HuntMode) {
    setMode(next);
    setPicked(enginesFor(next).map((engine) => engine.id));
    setFilter("all");
  }

  function toggleEngine(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(nextQuery = query, nextMode = mode, nextEngines = picked) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    setError("");
    setFilter("all");
    try {
      const response = await hunt({
        data: { query: trimmed, mode: nextMode, engines: nextEngines },
      });
      setResult(response);
      setQuery(trimmed);
      setMode(nextMode);
      const entry = { query: trimmed, mode: nextMode };
      const stored = [entry, ...recent.filter((item) => item.query !== entry.query || item.mode !== entry.mode)].slice(0, 6);
      setRecent(stored);
      localStorage.setItem(RECENT_KEY, JSON.stringify(stored));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The hunt failed.";
      setError(message.includes("Username sweep") ? message : message || "The hunt failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("");
    }
  }

  const live = result?.engines.filter((engine) => engine.ok).length ?? 0;
  const failed = result?.engines.filter((engine) => !engine.ok).length ?? 0;
  const mentions = result?.hits.filter((hit) => hit.mention !== "none").length ?? 0;
  const hosts = new Set(result?.hits.map((hit) => hit.host)).size;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="relative overflow-hidden border-b border-line">
        <img
          src="/masthead.jpg"
          alt="WolfSec crew in a server room: armored wolf, masked figures, and a city skyline"
          className="h-56 w-full object-cover object-center sm:h-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/25" />
        <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pb-5 sm:px-6">
          <p className="font-mono text-xs tracking-widest text-phosphor">WOLFSEC</p>
          <h1 className="font-mono text-3xl font-medium tracking-wide text-fg sm:text-5xl">ARRAY</h1>
          <p className="max-w-xl text-sm text-fg sm:text-base">
            Public web hunter. One query, dozens of indexes — web, code, packages, papers, news, archives, filings, and profiles.
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <form
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-mono text-xs tracking-widest text-muted">QUERY</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "hunt" ? "Name, domain, or phrase" : "Handle or email"}
                maxLength={160}
                className="h-12 w-full rounded-lg border border-line bg-bg px-3 font-mono text-fg outline-none placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-phosphor"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={busy || query.trim().length < 2 || picked.length === 0}
                className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-lg bg-phosphor px-4 font-medium text-bg disabled:opacity-50"
              >
                {busy ? <Radar className="size-4 animate-spin motion-reduce:animate-none" /> : <Search className="size-4" />}
                {busy ? "Hunting" : "Hunt"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Hunt mode">
            {(
              [
                ["hunt", "Mentions"],
                ["username", "Username"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                className={
                  mode === value
                    ? "h-11 rounded-lg bg-phosphor px-4 text-sm font-medium text-bg"
                    : "h-11 rounded-lg border border-line px-4 text-sm text-fg"
                }
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicked(available.map((engine) => engine.id))}
              className="h-11 rounded-lg border border-line px-4 text-sm text-muted"
            >
              All indexes
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="h-11 rounded-lg border border-line px-4 text-sm text-muted"
            >
              None
            </button>
            <span className="flex h-11 items-center font-mono text-xs text-muted tabular-nums">
              {picked.length}/{available.length} on
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {available.map((engine) => {
              const on = picked.includes(engine.id);
              return (
                <button
                  key={engine.id}
                  type="button"
                  aria-pressed={on}
                  title={engine.blurb}
                  onClick={() => toggleEngine(engine.id)}
                  className={
                    on
                      ? "h-11 rounded-full border border-phosphor px-3 text-sm text-phosphor"
                      : "h-11 rounded-full border border-line px-3 text-sm text-muted"
                  }
                >
                  {engine.label}
                </button>
              );
            })}
          </div>
        </form>

        {error ? (
          <p className="rounded-lg border border-signal/40 bg-surface px-4 py-3 text-sm text-signal" role="alert">
            {error}
          </p>
        ) : null}

        {!result && !busy ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-xs tracking-widest text-muted">TRY A LEAD</h2>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => {
                    const ids = enginesFor(example.mode).map((engine) => engine.id);
                    switchMode(example.mode);
                    setQuery(example.query);
                    void submit(example.query, example.mode, ids);
                  }}
                  className="h-11 rounded-lg border border-line bg-surface px-4 text-sm text-fg"
                >
                  {example.label}
                </button>
              ))}
            </div>
            {recent.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">RECENT</span>
                {recent.map((item) => (
                  <button
                    key={`${item.mode}-${item.query}`}
                    type="button"
                    onClick={() => {
                      const ids = enginesFor(item.mode).map((engine) => engine.id);
                      switchMode(item.mode);
                      setQuery(item.query);
                      void submit(item.query, item.mode, ids);
                    }}
                    className="h-11 rounded-lg border border-line px-3 font-mono text-sm text-fg"
                  >
                    {item.query}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="max-w-2xl text-sm text-muted">
              Public indexes only. No private records, no proxy rotation, no paid people-search brokers. A hit is a lead, not proof the subject controls that page.
            </p>
          </section>
        ) : null}

        {busy ? (
          <p className="font-mono text-sm text-phosphor" role="status">
            Querying {picked.length} public indexes…
          </p>
        ) : null}

        {result ? (
          <section className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <aside className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <Stat label="Leads" value={String(result.hits.length)} />
                <Stat label="Mentions" value={String(mentions)} />
                <Stat label="Hosts" value={String(hosts)} />
                <Stat label="Indexes" value={`${live} live${failed ? ` · ${failed} down` : ""}`} />
              </div>
              <p className="font-mono text-xs text-muted tabular-nums">{result.tookMs} ms</p>
              <ul className="flex max-h-96 flex-col gap-1 overflow-auto rounded-lg border border-line bg-surface p-2">
                {result.engines.map((engine) => (
                  <li key={engine.id} className="flex items-start justify-between gap-3 px-2 py-1.5">
                    <span className="min-w-0">
                      <span className={engine.ok ? "block text-sm text-fg" : "block text-sm text-signal"}>
                        {engine.label}
                      </span>
                      {engine.note ? <span className="block text-xs text-muted">{engine.note}</span> : null}
                    </span>
                    <span className="font-mono text-xs text-muted tabular-nums">{engine.ok ? engine.count : "—"}</span>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <FilterChip on={filter === "all"} onClick={() => setFilter("all")} label="All" />
                  <FilterChip on={filter === "mentions"} onClick={() => setFilter("mentions")} label="Mentions" />
                  {categories.map((category) => (
                    <FilterChip
                      key={category}
                      on={filter === category}
                      onClick={() => setFilter(category)}
                      label={CATEGORY_LABEL[category]}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => download(`${slug(result.query)}.json`, "application/json", JSON.stringify(result, null, 2))}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg"
                  >
                    <Download className="size-4" />
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => download(`${slug(result.query)}.csv`, "text/csv", toCsv(result.hits))}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg"
                  >
                    <Download className="size-4" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => download(`${slug(result.query)}.md`, "text/markdown", toMarkdown(result))}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-fg"
                  >
                    <Download className="size-4" />
                    MD
                  </button>
                </div>
              </div>

              {visibleHits.length === 0 ? (
                <p className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-muted">
                  No leads in this view. Indexes that answered are listed on the side — a miss there means the public record was empty or the source declined the request.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visibleHits.map((hit) => {
                    const mention = mentionLabel(hit.mention);
                    return (
                      <li key={`${hit.engine}-${hit.url}`} className="rounded-lg border border-line bg-surface p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-phosphor">{hit.engineLabel}</span>
                          <span className="font-mono text-xs text-muted">{CATEGORY_LABEL[hit.category]}</span>
                          {mention ? <span className="font-mono text-xs text-signal">{mention}</span> : null}
                          {hit.extra ? <span className="font-mono text-xs text-muted">{hit.extra}</span> : null}
                        </div>
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 block text-base font-medium text-fg underline decoration-line underline-offset-4"
                        >
                          {hit.title}
                        </a>
                        <p className="mt-2 text-sm text-muted">{hit.snippet}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="min-w-0 truncate font-mono text-xs text-muted">{hit.host}</span>
                          <button
                            type="button"
                            onClick={() => void copyUrl(hit.url)}
                            className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-xs text-fg"
                          >
                            <Copy className="size-3.5" />
                            {copied === hit.url ? "Copied" : "Copy URL"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3">
      <p className="font-mono text-xs tracking-widest text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg text-fg tabular-nums">{value}</p>
    </div>
  );
}

function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "h-11 rounded-full bg-phosphor px-3 text-sm font-medium text-bg"
          : "h-11 rounded-full border border-line px-3 text-sm text-fg"
      }
    >
      {label}
    </button>
  );
}
