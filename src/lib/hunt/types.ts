export const CATEGORIES = [
  "web",
  "community",
  "code",
  "packages",
  "papers",
  "archive",
  "places",
  "infra",
  "identity",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type HuntMode = "hunt" | "username";

export type Mention = "title" | "url" | "snippet" | "none";

export type Hit = {
  engine: string;
  engineLabel: string;
  category: Category;
  title: string;
  url: string;
  snippet: string;
  host: string;
  mention: Mention;
  extra?: string;
};

export type EngineReport = {
  id: string;
  label: string;
  category: Category;
  ok: boolean;
  count: number;
  ms: number;
  note?: string;
};

export type HuntResponse = {
  query: string;
  mode: HuntMode;
  tookMs: number;
  hits: Hit[];
  engines: EngineReport[];
};
