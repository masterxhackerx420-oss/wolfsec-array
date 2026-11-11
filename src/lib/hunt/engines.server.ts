import { createHash } from "node:crypto";
import { ENGINES } from "./catalog";
import type { EngineReport, Hit, HuntMode, HuntResponse, Mention } from "./types";

const UA = "WolfSecArray/1.0 (public OSINT desk; research use)";

type Raw = { title: string; url: string; snippet: string; extra?: string };

type Ctx = {
  query: string;
  handle: string | null;
  email: string | null;
  domain: string | null;
};

function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const key = entity.toLowerCase();
      if (key === "amp") return "&";
      if (key === "lt") return "<";
      if (key === "gt") return ">";
      if (key === "quot") return '"';
      if (key === "apos" || key === "#39") return "'";
      if (key === "nbsp") return " ";
      if (key.startsWith("#x")) {
        const code = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (key.startsWith("#")) {
        const code = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string, max = 280): string {
  const text = clean(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function mentionOf(query: string, title: string, url: string, snippet: string): Mention {
  const needle = query.toLowerCase();
  if (!needle) return "none";
  if (title.toLowerCase().includes(needle)) return "title";
  if (url.toLowerCase().includes(needle)) return "url";
  if (snippet.toLowerCase().includes(needle)) return "snippet";
  return "none";
}

async function getText(url: string, ms = 6500): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
      },
    });
    const text = (await res.text()).slice(0, 1_200_000);
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, ms = 6500): Promise<unknown> {
  const { status, text } = await getText(url, ms);
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return JSON.parse(text) as unknown;
}

function take(rows: Raw[], limit = 6): Raw[] {
  const seen = new Set<string>();
  const out: Raw[] = [];
  for (const row of rows) {
    const url = safeUrl(row.url);
    const title = clip(row.title, 180);
    if (!url || !title) continue;
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      url,
      snippet: clip(row.snippet || hostOf(url)),
      extra: row.extra ? clip(row.extra, 80) : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function q(value: string): string {
  return encodeURIComponent(value);
}

function inner(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? clean(match[1] ?? "") : "";
}

function blocks(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi")) ?? [];
}

async function ddgInstant(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://api.duckduckgo.com/?q=${q(ctx.query)}&format=json&no_html=1&skip_disambig=1`));
  const rows: Raw[] = [];
  const abstractUrl = str(data?.AbstractURL);
  const abstract = str(data?.AbstractText);
  const heading = str(data?.Heading);
  if (abstractUrl && (abstract || heading)) {
    rows.push({ title: heading || abstract, url: abstractUrl, snippet: abstract || heading });
  }
  const walk = (topics: unknown[]) => {
    for (const topic of topics) {
      const rec = asRecord(topic);
      if (!rec) continue;
      if (Array.isArray(rec.Topics)) walk(rec.Topics);
      const url = str(rec.FirstURL);
      const text = str(rec.Text);
      if (!url || !text) continue;
      const [title, ...rest] = text.split(" - ");
      rows.push({ title: title || text, url, snippet: rest.join(" - ") || text });
    }
  };
  walk(asArray(data?.RelatedTopics));
  return take(rows);
}

async function ddgWeb(ctx: Ctx): Promise<Raw[]> {
  const { status, text } = await getText(`https://lite.duckduckgo.com/lite/?q=${q(ctx.query)}`);
  if (status >= 400) throw new Error(`HTTP ${status}`);
  const rows: Raw[] = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*class='result-link'>([\s\S]*?)<\/a>[\s\S]*?class='result-snippet'>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const href = match[1] ?? "";
    const abs = href.startsWith("//") ? `https:${href}` : href;
    let url = abs;
    try {
      const parsed = new URL(abs);
      url = parsed.searchParams.get("uddg") || abs;
    } catch {
      url = abs;
    }
    rows.push({ title: clean(match[2] ?? ""), url, snippet: clean(match[3] ?? "") });
  }
  return take(rows);
}

async function wikipedia(ctx: Ctx): Promise<Raw[]> {
  const data = (await getJson(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${q(ctx.query)}&limit=6&namespace=0&format=json`,
  )) as unknown[];
  const titles = asArray(data[1]);
  const snippets = asArray(data[2]);
  const urls = asArray(data[3]);
  return take(
    titles.map((title, index) => ({
      title: str(title),
      url: str(urls[index]),
      snippet: str(snippets[index]),
    })),
  );
}

async function wikidata(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q(ctx.query)}&language=en&format=json&limit=6`,
    ),
  );
  return take(
    asArray(data?.search).map((item) => {
      const rec = asRecord(item);
      return {
        title: str(rec?.label) || str(rec?.id),
        url: str(rec?.concepturi),
        snippet: str(rec?.description) || str(rec?.id),
        extra: str(rec?.id),
      };
    }),
  );
}

async function commons(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${q(ctx.query)}&srnamespace=6&format=json&srlimit=6`,
    ),
  );
  const search = asArray(asRecord(data?.query)?.search);
  return take(
    search.map((item) => {
      const rec = asRecord(item);
      const title = str(rec?.title);
      return {
        title,
        url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        snippet: str(rec?.snippet),
      };
    }),
  );
}

async function googleNews(ctx: Ctx): Promise<Raw[]> {
  const { status, text } = await getText(
    `https://news.google.com/rss/search?q=${q(ctx.query)}&hl=en-US&gl=US&ceid=US:en`,
  );
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return take(
    blocks(text, "item").map((item) => ({
      title: inner(item, "title"),
      url: inner(item, "link"),
      snippet: inner(item, "description"),
    })),
  );
}

async function bluesky(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${q(ctx.query)}&limit=6`),
  );
  return take(
    asArray(data?.actors).map((item) => {
      const rec = asRecord(item);
      const handle = str(rec?.handle);
      return {
        title: str(rec?.displayName) || handle,
        url: `https://bsky.app/profile/${handle}`,
        snippet: str(rec?.description) || handle,
        extra: handle,
      };
    }),
  );
}

async function hackerNews(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://hn.algolia.com/api/v1/search?query=${q(ctx.query)}&hitsPerPage=6`));
  return take(
    asArray(data?.hits).map((item) => {
      const rec = asRecord(item);
      const objectId = str(rec?.objectID);
      const url = str(rec?.url) || (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : "");
      const points = typeof rec?.points === "number" ? `${rec.points} points` : "";
      return {
        title: str(rec?.title) || str(rec?.story_title) || "Hacker News",
        url,
        snippet: str(rec?.story_text) || str(rec?.comment_text) || [points, str(rec?.author)].filter(Boolean).join(" · "),
        extra: points,
      };
    }),
  );
}

async function stackOverflow(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${q(ctx.query)}&site=stackoverflow&pagesize=6`,
    ),
  );
  return take(
    asArray(data?.items).map((item) => {
      const rec = asRecord(item);
      const questionId = rec?.question_id;
      const id = typeof questionId === "number" ? String(questionId) : str(questionId);
      return {
        title: str(rec?.title),
        url: str(rec?.link) || (id ? `https://stackoverflow.com/questions/${id}` : ""),
        snippet: str(rec?.excerpt),
      };
    }),
  );
}

async function githubRepos(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://api.github.com/search/repositories?q=${q(ctx.query)}&per_page=6`));
  return take(
    asArray(data?.items).map((item) => {
      const rec = asRecord(item);
      const stars = typeof rec?.stargazers_count === "number" ? `${rec.stargazers_count} stars` : "";
      return {
        title: str(rec?.full_name),
        url: str(rec?.html_url),
        snippet: str(rec?.description) || stars,
        extra: [str(rec?.language), stars].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function githubUsers(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://api.github.com/search/users?q=${q(ctx.query)}&per_page=6`));
  return take(
    asArray(data?.items).map((item) => {
      const rec = asRecord(item);
      return {
        title: str(rec?.login),
        url: str(rec?.html_url),
        snippet: str(rec?.type) || "GitHub account",
      };
    }),
  );
}

async function gitlab(ctx: Ctx): Promise<Raw[]> {
  const data = await getJson(
    `https://gitlab.com/api/v4/projects?search=${q(ctx.query)}&per_page=6&order_by=last_activity_at&simple=true`,
  );
  return take(
    asArray(data).map((item) => {
      const rec = asRecord(item);
      return {
        title: str(rec?.path_with_namespace) || str(rec?.name),
        url: str(rec?.web_url),
        snippet: str(rec?.description),
      };
    }),
  );
}

async function huggingFace(ctx: Ctx): Promise<Raw[]> {
  const data = await getJson(`https://huggingface.co/api/models?search=${q(ctx.query)}&limit=6`);
  return take(
    asArray(data).map((item) => {
      const rec = asRecord(item);
      const id = str(rec?.id);
      const downloads = typeof rec?.downloads === "number" ? `${rec.downloads} downloads` : "";
      return {
        title: id,
        url: `https://huggingface.co/${id}`,
        snippet: str(rec?.pipeline_tag) || downloads || "Public model",
        extra: downloads,
      };
    }),
  );
}

async function npmSearch(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://registry.npmjs.org/-/v1/search?text=${q(ctx.query)}&size=6`));
  return take(
    asArray(data?.objects).map((item) => {
      const pkg = asRecord(asRecord(item)?.package);
      const links = asRecord(pkg?.links);
      return {
        title: str(pkg?.name),
        url: str(links?.npm) || `https://www.npmjs.com/package/${str(pkg?.name)}`,
        snippet: str(pkg?.description),
      };
    }),
  );
}

async function cratesSearch(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://crates.io/api/v1/crates?q=${q(ctx.query)}&per_page=6`));
  return take(
    asArray(data?.crates).map((item) => {
      const rec = asRecord(item);
      const name = str(rec?.name);
      return {
        title: name,
        url: `https://crates.io/crates/${name}`,
        snippet: str(rec?.description),
        extra: str(rec?.max_version),
      };
    }),
  );
}

async function rubyGems(ctx: Ctx): Promise<Raw[]> {
  const data = await getJson(`https://rubygems.org/api/v1/search.json?query=${q(ctx.query)}`);
  return take(
    asArray(data)
      .slice(0, 6)
      .map((item) => {
        const rec = asRecord(item);
        return {
          title: str(rec?.name),
          url: str(rec?.project_uri) || str(rec?.homepage_uri),
          snippet: str(rec?.info),
        };
      }),
  );
}

async function packagist(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://packagist.org/search.json?q=${q(ctx.query)}&per_page=6`));
  return take(
    asArray(data?.results).map((item) => {
      const rec = asRecord(item);
      return {
        title: str(rec?.name),
        url: str(rec?.url),
        snippet: str(rec?.description),
      };
    }),
  );
}

async function nuget(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://azuresearch-usnc.nuget.org/query?q=${q(ctx.query)}&take=6`));
  return take(
    asArray(data?.data).map((item) => {
      const rec = asRecord(item);
      const id = str(rec?.id);
      return {
        title: str(rec?.title) || id,
        url: str(rec?.projectUrl) || `https://www.nuget.org/packages/${id}`,
        snippet: str(rec?.description),
        extra: str(rec?.version),
      };
    }),
  );
}

async function hexSearch(ctx: Ctx): Promise<Raw[]> {
  const data = await getJson(`https://hex.pm/api/packages?search=${q(ctx.query)}&page=1`);
  return take(
    asArray(data)
      .slice(0, 6)
      .map((item) => {
        const rec = asRecord(item);
        const meta = asRecord(rec?.meta);
        const name = str(rec?.name);
        return {
          title: name,
          url: str(rec?.html_url) || (name ? `https://hex.pm/packages/${name}` : ""),
          snippet: str(meta?.description) || str(rec?.description),
        };
      }),
  );
}

async function arxiv(ctx: Ctx): Promise<Raw[]> {
  const { status, text } = await getText(
    `https://export.arxiv.org/api/query?search_query=all:${q(ctx.query)}&start=0&max_results=6`,
  );
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return take(
    blocks(text, "entry").map((entry) => ({
      title: inner(entry, "title"),
      url: inner(entry, "id"),
      snippet: inner(entry, "summary"),
    })),
  );
}

async function crossref(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://api.crossref.org/works?query=${q(ctx.query)}&rows=6`));
  const items = asArray(asRecord(data?.message)?.items);
  return take(
    items.map((item) => {
      const rec = asRecord(item);
      const title = asArray(rec?.title).map(str).find(Boolean) || "";
      const authors = asArray(rec?.author)
        .map((author) => {
          const person = asRecord(author);
          return [str(person?.given), str(person?.family)].filter(Boolean).join(" ");
        })
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      return {
        title,
        url: str(rec?.URL),
        snippet: authors || str(asArray(rec?.["container-title"])[0]),
      };
    }),
  );
}

async function doaj(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://doaj.org/api/search/articles/${q(ctx.query)}?pageSize=6`));
  return take(
    asArray(data?.results).map((item) => {
      const bib = asRecord(asRecord(item)?.bibjson);
      const links = asArray(bib?.link);
      const link = links.map(asRecord).map((row) => str(row?.url)).find(Boolean) || "";
      const doi = asArray(bib?.identifier)
        .map(asRecord)
        .find((row) => str(row?.type) === "doi");
      return {
        title: str(bib?.title),
        url: link || (doi ? `https://doi.org/${str(doi.id)}` : ""),
        snippet: str(bib?.abstract) || str(asRecord(bib?.journal)?.title),
      };
    }),
  );
}

async function pubmed(ctx: Ctx): Promise<Raw[]> {
  const search = asRecord(
    await getJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=6&term=${q(ctx.query)}`,
    ),
  );
  const ids = asArray(asRecord(search?.esearchresult)?.idlist).map(str).filter(Boolean);
  if (!ids.length) return [];
  const summary = asRecord(
    await getJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
    ),
  );
  const result = asRecord(summary?.result);
  return take(
    ids.map((id) => {
      const rec = asRecord(result?.[id]);
      return {
        title: str(rec?.title),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        snippet: [str(rec?.source), str(rec?.pubdate)].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function archive(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://archive.org/advancedsearch.php?q=${q(ctx.query)}&fl[]=identifier&fl[]=title&fl[]=description&output=json&rows=6`,
    ),
  );
  const docs = asArray(asRecord(data?.response)?.docs);
  return take(
    docs.map((item) => {
      const rec = asRecord(item);
      const identifier = str(rec?.identifier);
      const title = Array.isArray(rec?.title) ? str(rec?.title[0]) : str(rec?.title);
      const description = Array.isArray(rec?.description) ? str(rec?.description[0]) : str(rec?.description);
      return {
        title,
        url: identifier ? `https://archive.org/details/${identifier}` : "",
        snippet: description,
      };
    }),
  );
}

async function openLibrary(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(await getJson(`https://openlibrary.org/search.json?q=${q(ctx.query)}&limit=6`));
  return take(
    asArray(data?.docs).map((item) => {
      const rec = asRecord(item);
      const key = str(rec?.key);
      const authors = asArray(rec?.author_name).map(str).filter(Boolean).slice(0, 3).join(", ");
      const year = typeof rec?.first_publish_year === "number" ? String(rec.first_publish_year) : "";
      return {
        title: str(rec?.title),
        url: key ? `https://openlibrary.org${key}` : "",
        snippet: [authors, year].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function musicBrainz(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(`https://musicbrainz.org/ws/2/artist/?query=${q(ctx.query)}&fmt=json&limit=6`),
  );
  return take(
    asArray(data?.artists).map((item) => {
      const rec = asRecord(item);
      const id = str(rec?.id);
      return {
        title: str(rec?.name),
        url: id ? `https://musicbrainz.org/artist/${id}` : "",
        snippet: [str(rec?.type), str(rec?.country), str(rec?.disambiguation)].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function nominatim(ctx: Ctx): Promise<Raw[]> {
  const data = await getJson(
    `https://nominatim.openstreetmap.org/search?q=${q(ctx.query)}&format=jsonv2&limit=5`,
  );
  return take(
    asArray(data).map((item) => {
      const rec = asRecord(item);
      const kind = str(rec?.osm_type);
      const id = str(rec?.osm_id) || (typeof rec?.osm_id === "number" ? String(rec.osm_id) : "");
      return {
        title: str(rec?.display_name).split(",").slice(0, 2).join(","),
        url: kind && id ? `https://www.openstreetmap.org/${kind}/${id}` : "",
        snippet: str(rec?.display_name),
        extra: [str(rec?.lat), str(rec?.lon)].filter(Boolean).join(", "),
      };
    }),
  );
}

async function nvd(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${q(ctx.query)}&resultsPerPage=5`,
    ),
  );
  return take(
    asArray(data?.vulnerabilities).map((item) => {
      const cve = asRecord(asRecord(item)?.cve);
      const id = str(cve?.id);
      const desc = asArray(cve?.descriptions)
        .map(asRecord)
        .find((row) => str(row?.lang) === "en");
      return {
        title: id,
        url: id ? `https://nvd.nist.gov/vuln/detail/${id}` : "",
        snippet: str(desc?.value),
      };
    }),
  );
}

async function secEdgar(ctx: Ctx): Promise<Raw[]> {
  const data = asRecord(
    await getJson(
      `https://efts.sec.gov/LATEST/search-index?q=${q(`"${ctx.query}"`)}&dateRange=custom&startdt=2018-01-01&enddt=2026-12-31`,
    ),
  );
  const hits = asArray(asRecord(data?.hits)?.hits);
  return take(
    hits.slice(0, 6).map((item) => {
      const rec = asRecord(item);
      const source = asRecord(rec?._source);
      const id = str(rec?._id);
      const file = id.includes(":") ? id.split(":").slice(1).join(":") : "";
      const adsh = str(source?.adsh);
      const cik = str(asArray(source?.ciks)[0]).replace(/^0+/, "");
      const url =
        cik && adsh && file
          ? `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${file}`
          : "https://www.sec.gov/edgar/search/";
      return {
        title: str(asArray(source?.display_names)[0]) || str(source?.form) || "SEC filing",
        url,
        snippet: [str(source?.form), str(source?.file_type), str(source?.file_date)].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function urlscan(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.domain) return [];
  const data = asRecord(await getJson(`https://urlscan.io/api/v1/search/?q=${q(`domain:${ctx.domain}`)}&size=5`));
  return take(
    asArray(data?.results).map((item) => {
      const rec = asRecord(item);
      const page = asRecord(rec?.page);
      const task = asRecord(rec?.task);
      return {
        title: str(page?.title) || str(page?.domain) || str(page?.url),
        url: str(page?.url),
        snippet: [str(page?.domain), str(task?.time)].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function crt(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.domain) return [];
  const data = await getJson(`https://crt.sh/?q=${q(ctx.domain)}&output=json`, 8000);
  const names = new Map<string, string>();
  for (const item of asArray(data)) {
    const rec = asRecord(item);
    const name = str(rec?.common_name).replace(/^\*\./, "");
    if (!name || names.has(name)) continue;
    names.set(name, str(rec?.not_before));
    if (names.size >= 6) break;
  }
  return take(
    [...names.entries()].map(([name, seen]) => ({
      title: name,
      url: `https://crt.sh/?q=${q(name)}`,
      snippet: seen ? `Certificate logged ${seen}` : "Certificate transparency hit",
    })),
  );
}

async function readProfile(url: string, read: (body: string) => Raw | null): Promise<Raw[]> {
  const { status, text } = await getText(url, 6000);
  if (status === 404 || status === 400 || status === 410) return [];
  if (status >= 400) throw new Error(`HTTP ${status}`);
  const hit = read(text);
  return hit ? take([hit], 1) : [];
}

function jsonRecord(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

async function githubProfile(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://api.github.com/users/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || str(rec.message) === "Not Found" || !str(rec.login)) return null;
    return {
      title: str(rec.name) || str(rec.login),
      url: str(rec.html_url),
      snippet: [str(rec.bio), str(rec.company), str(rec.location)].filter(Boolean).join(" · ") || "Public GitHub profile",
      extra: typeof rec.public_repos === "number" ? `${rec.public_repos} repos` : undefined,
    };
  });
}

async function gitlabUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const data = await getJson(`https://gitlab.com/api/v4/users?username=${q(ctx.handle)}`);
  const rec = asRecord(asArray(data)[0]);
  if (!rec) return [];
  const username = str(rec.username);
  return take([
    {
      title: str(rec.name) || username,
      url: `https://gitlab.com/${username}`,
      snippet: "Public GitLab account",
    },
  ], 1);
}

async function codebergUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://codeberg.org/api/v1/users/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.login)) return null;
    return {
      title: str(rec.full_name) || str(rec.login),
      url: str(rec.html_url) || `https://codeberg.org/${str(rec.login)}`,
      snippet: "Public Codeberg account",
    };
  });
}

async function hnUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const { status, text } = await getText(`https://hacker-news.firebaseio.com/v0/user/${q(ctx.handle)}.json`);
  if (status >= 400) throw new Error(`HTTP ${status}`);
  if (!text || text.trim() === "null") return [];
  const rec = jsonRecord(text);
  if (!rec || !str(rec.id)) return [];
  return take([
    {
      title: str(rec.id),
      url: `https://news.ycombinator.com/user?id=${q(str(rec.id))}`,
      snippet: typeof rec.karma === "number" ? `Karma ${rec.karma}` : "Hacker News account",
      extra: str(rec.about),
    },
  ], 1);
}

async function keybaseUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const data = asRecord(await getJson(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${q(ctx.handle)}`));
  const person = asRecord(asArray(data?.them)[0]);
  if (!person || !str(person.id)) return [];
  const basics = asRecord(person.basics);
  const profile = asRecord(person.profile);
  const username = str(basics?.username) || ctx.handle;
  return take([
    {
      title: str(profile?.full_name) || username,
      url: `https://keybase.io/${username}`,
      snippet: "Public Keybase identity",
    },
  ], 1);
}

async function devtoUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://dev.to/api/users/by_username?url=${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.name) || str(rec.username),
      url: `https://dev.to/${str(rec.username)}`,
      snippet: str(rec.summary) || "DEV profile",
    };
  });
}

async function cratesUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://crates.io/api/v1/users/${q(ctx.handle)}`, (body) => {
    const rec = asRecord(jsonRecord(body)?.user);
    if (!rec || !str(rec.login)) return null;
    return {
      title: str(rec.name) || str(rec.login),
      url: str(rec.url) || `https://crates.io/users/${str(rec.login)}`,
      snippet: "crates.io user",
    };
  });
}

async function chessUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://api.chess.com/pub/player/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.name) || str(rec.username),
      url: str(rec.url) || `https://www.chess.com/member/${str(rec.username)}`,
      snippet: [str(rec.location), str(rec.country)].filter(Boolean).join(" · ") || "Chess.com player",
    };
  });
}

async function lichessUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://lichess.org/api/user/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.username),
      url: `https://lichess.org/@/${str(rec.username)}`,
      snippet: str(rec.title) || "Lichess player",
    };
  });
}

async function dockerUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://hub.docker.com/v2/users/${q(ctx.handle)}/`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username) && !str(rec.id)) return null;
    const username = str(rec.username) || ctx.handle || "";
    return {
      title: str(rec.full_name) || username,
      url: `https://hub.docker.com/u/${username}`,
      snippet: str(rec.location) || str(rec.company) || "Docker Hub user",
    };
  });
}

async function hfUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://huggingface.co/api/users/${q(ctx.handle)}/overview`, (body) => {
    const rec = jsonRecord(body);
    if (!rec) return null;
    const user = str(rec.user) || ctx.handle || "";
    if (!user) return null;
    return {
      title: str(rec.fullname) || user,
      url: `https://huggingface.co/${user}`,
      snippet: typeof rec.numModels === "number" ? `${rec.numModels} models` : "Hugging Face user",
    };
  });
}

async function bskyUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const actor = ctx.handle.includes(".") ? ctx.handle : `${ctx.handle}.bsky.social`;
  return readProfile(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${q(actor)}`,
    (body) => {
      const rec = jsonRecord(body);
      if (!rec || !str(rec.handle)) return null;
      return {
        title: str(rec.displayName) || str(rec.handle),
        url: `https://bsky.app/profile/${str(rec.handle)}`,
        snippet: str(rec.description) || str(rec.handle),
      };
    },
  );
}

async function lemmyUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://lemmy.world/api/v3/user?username=${q(ctx.handle)}`, (body) => {
    const person = asRecord(asRecord(jsonRecord(body)?.person_view)?.person);
    if (!person || !str(person.name)) return null;
    return {
      title: str(person.display_name) || str(person.name),
      url: str(person.actor_id) || `https://lemmy.world/u/${str(person.name)}`,
      snippet: "lemmy.world account",
    };
  });
}

async function codewarsUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://www.codewars.com/api/v1/users/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.name) || str(rec.username),
      url: `https://www.codewars.com/users/${str(rec.username)}`,
      snippet: typeof rec.honor === "number" ? `Honor ${rec.honor}` : "Codewars user",
    };
  });
}

async function bitbucketUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://api.bitbucket.org/2.0/users/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.display_name) || str(rec.username),
      url: str(rec.website) || `https://bitbucket.org/${str(rec.username)}/`,
      snippet: str(rec.location) || "Bitbucket account",
    };
  });
}

async function launchpadUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://api.launchpad.net/1.0/~${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.web_link) && !str(rec.name)) return null;
    return {
      title: str(rec.display_name) || str(rec.name) || ctx.handle || "Launchpad",
      url: str(rec.web_link),
      snippet: str(rec.description) || "Launchpad account",
    };
  });
}

async function gemsUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://rubygems.org/api/v1/profiles/${q(ctx.handle)}.json`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.id) && !str(rec.handle)) return null;
    const handle = str(rec.handle) || ctx.handle || "";
    return {
      title: handle,
      url: `https://rubygems.org/profiles/${handle}`,
      snippet: "RubyGems profile",
    };
  });
}

async function mastodonUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://mastodon.social/api/v1/accounts/lookup?acct=${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.display_name) || str(rec.username),
      url: str(rec.url),
      snippet: str(rec.note) || `@${str(rec.acct)}`,
    };
  });
}

async function modrinthUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  return readProfile(`https://api.modrinth.com/v2/user/${q(ctx.handle)}`, (body) => {
    const rec = jsonRecord(body);
    if (!rec || !str(rec.username)) return null;
    return {
      title: str(rec.name) || str(rec.username),
      url: `https://modrinth.com/user/${str(rec.username)}`,
      snippet: str(rec.bio) || "Modrinth user",
    };
  });
}

async function wikiUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const data = asRecord(
    await getJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${q(ctx.handle)}&format=json`,
    ),
  );
  const rec = asRecord(asArray(asRecord(data?.query)?.users)[0]);
  if (!rec || "missing" in rec || !str(rec.name)) return [];
  const name = str(rec.name);
  return take([
    {
      title: name,
      url: `https://en.wikipedia.org/wiki/User:${encodeURIComponent(name.replace(/ /g, "_"))}`,
      snippet: "Wikipedia editor account",
    },
  ], 1);
}

async function npmUser(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.handle) return [];
  const data = asRecord(
    await getJson(`https://registry.npmjs.org/-/v1/search?text=${q(`maintainer:${ctx.handle}`)}&size=3`),
  );
  const names = asArray(data?.objects)
    .map((item) => str(asRecord(asRecord(item)?.package)?.name))
    .filter(Boolean);
  if (!names.length) return [];
  return take([
    {
      title: ctx.handle,
      url: `https://www.npmjs.com/~${q(ctx.handle)}`,
      snippet: `Maintainer on ${names.join(", ")}`,
    },
  ], 1);
}

async function gravatar(ctx: Ctx): Promise<Raw[]> {
  if (!ctx.email) return [];
  const hash = createHash("md5").update(ctx.email.trim().toLowerCase()).digest("hex");
  return readProfile(`https://www.gravatar.com/${hash}.json`, (body) => {
    const entry = asRecord(asArray(jsonRecord(body)?.entry)[0]);
    if (!entry) return null;
    return {
      title: str(entry.displayName) || ctx.email || "Gravatar",
      url: str(entry.profileUrl) || `https://gravatar.com/${hash}`,
      snippet: str(entry.aboutMe) || "Public Gravatar profile",
    };
  });
}

const RUNNERS: Record<string, (ctx: Ctx) => Promise<Raw[]>> = {
  "ddg-instant": ddgInstant,
  "ddg-web": ddgWeb,
  wikipedia,
  wikidata,
  commons,
  "google-news": googleNews,
  bluesky,
  hackernews: hackerNews,
  stackoverflow: stackOverflow,
  "github-repos": githubRepos,
  "github-users": githubUsers,
  gitlab,
  hf: huggingFace,
  npm: npmSearch,
  crates: cratesSearch,
  rubygems: rubyGems,
  packagist,
  nuget,
  hex: hexSearch,
  arxiv,
  crossref,
  doaj,
  pubmed,
  archive,
  openlibrary: openLibrary,
  musicbrainz: musicBrainz,
  nominatim,
  nvd,
  sec: secEdgar,
  urlscan,
  crt,
  "gh-user": githubProfile,
  "gl-user": gitlabUser,
  "cb-user": codebergUser,
  "hn-user": hnUser,
  "kb-user": keybaseUser,
  "devto-user": devtoUser,
  "crates-user": cratesUser,
  "chess-user": chessUser,
  "lichess-user": lichessUser,
  "docker-user": dockerUser,
  "hf-user": hfUser,
  "bsky-user": bskyUser,
  "lemmy-user": lemmyUser,
  "codewars-user": codewarsUser,
  "bb-user": bitbucketUser,
  "lp-user": launchpadUser,
  "gems-user": gemsUser,
  "masto-user": mastodonUser,
  "modrinth-user": modrinthUser,
  "wiki-user": wikiUser,
  "npm-user": npmUser,
  gravatar,
};

function isHandle(value: string): boolean {
  return /^[A-Za-z0-9._-]{2,39}$/.test(value);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function domainOf(value: string): string | null {
  const match = value.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i);
  return match ? match[0].toLowerCase() : null;
}

function dedupe(hits: Hit[]): Hit[] {
  const rank: Record<Mention, number> = { title: 0, url: 1, snippet: 2, none: 3 };
  const byUrl = new Map<string, Hit>();
  for (const hit of hits) {
    const key = hit.url.replace(/\/$/, "").toLowerCase();
    const prev = byUrl.get(key);
    if (!prev || rank[hit.mention] < rank[prev.mention]) byUrl.set(key, hit);
  }
  return [...byUrl.values()].sort((a, b) => rank[a.mention] - rank[b.mention] || a.engineLabel.localeCompare(b.engineLabel));
}

async function pool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) await task(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}

export async function executeHunt(input: {
  query: string;
  mode: HuntMode;
  engines?: string[];
}): Promise<HuntResponse> {
  const started = Date.now();
  const query = input.query.trim().replace(/\s+/g, " ");
  const email = isEmail(query) ? query : null;
  const handle = isHandle(query) ? query : email && isHandle(query.split("@")[0] ?? "") ? query.split("@")[0] ?? null : null;
  if (input.mode === "username" && !handle && !email) {
    throw new Error("Username sweep wants a handle, or an email for Gravatar.");
  }
  const ctx: Ctx = { query, handle, email, domain: domainOf(query) };
  const allowed = new Set(input.engines?.length ? input.engines : ENGINES.map((engine) => engine.id));
  const selected = ENGINES.filter((engine) => engine.modes.includes(input.mode) && allowed.has(engine.id));
  if (!selected.length) throw new Error("Pick at least one index.");

  const hits: Hit[] = [];
  const reports: EngineReport[] = [];

  await pool(selected, 8, async (engine) => {
    const t0 = Date.now();
    try {
      let note: string | undefined;
      if ((engine.id === "crt" || engine.id === "urlscan") && !ctx.domain) {
        note = "Add a domain to query this index";
      }
      if (engine.id === "gravatar" && !ctx.email) note = "Add an email to check Gravatar";
      if (engine.category === "identity" && engine.id !== "gravatar" && !ctx.handle) {
        note = "Needs a handle";
      }
      const runner = RUNNERS[engine.id];
      const rows = note || !runner ? [] : await runner(ctx);
      const shaped = rows.map((row) => ({
        engine: engine.id,
        engineLabel: engine.label,
        category: engine.category,
        title: row.title,
        url: row.url,
        snippet: row.snippet,
        host: hostOf(row.url),
        mention: mentionOf(query, row.title, row.url, row.snippet),
        extra: row.extra,
      }));
      hits.push(...shaped);
      reports.push({
        id: engine.id,
        label: engine.label,
        category: engine.category,
        ok: true,
        count: shaped.length,
        ms: Date.now() - t0,
        note,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      reports.push({
        id: engine.id,
        label: engine.label,
        category: engine.category,
        ok: false,
        count: 0,
        ms: Date.now() - t0,
        note: message.includes("Abort") ? "Timed out" : clip(message, 80),
      });
    }
  });

  const order = new Map(selected.map((engine, index) => [engine.id, index]));
  reports.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    query,
    mode: input.mode,
    tookMs: Date.now() - started,
    hits: dedupe(hits),
    engines: reports,
  };
}
