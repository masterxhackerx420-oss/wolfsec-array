import type { Category, HuntMode } from "./types";

export type EngineMeta = {
  id: string;
  label: string;
  category: Category;
  modes: HuntMode[];
  blurb: string;
};

export const ENGINES: EngineMeta[] = [
  { id: "ddg-instant", label: "DuckDuckGo Brief", category: "web", modes: ["hunt"], blurb: "Instant answer and related topics" },
  { id: "ddg-web", label: "DuckDuckGo Web", category: "web", modes: ["hunt"], blurb: "Public web result titles and snippets" },
  { id: "wikipedia", label: "Wikipedia", category: "web", modes: ["hunt"], blurb: "Encyclopedia matches" },
  { id: "wikidata", label: "Wikidata", category: "web", modes: ["hunt"], blurb: "Structured entity records" },
  { id: "commons", label: "Wikimedia Commons", category: "web", modes: ["hunt"], blurb: "Public media files" },
  { id: "google-news", label: "Google News", category: "web", modes: ["hunt"], blurb: "News headlines from the public RSS feed" },
  { id: "bluesky", label: "Bluesky", category: "community", modes: ["hunt"], blurb: "Public profiles matching the phrase" },
  { id: "hackernews", label: "Hacker News", category: "community", modes: ["hunt"], blurb: "Stories and comments" },
  { id: "stackoverflow", label: "Stack Overflow", category: "community", modes: ["hunt"], blurb: "Questions and excerpts" },
  { id: "github-repos", label: "GitHub Repos", category: "code", modes: ["hunt"], blurb: "Public repositories" },
  { id: "github-users", label: "GitHub Users", category: "code", modes: ["hunt"], blurb: "Public accounts" },
  { id: "gitlab", label: "GitLab", category: "code", modes: ["hunt"], blurb: "Public projects" },
  { id: "hf", label: "Hugging Face", category: "code", modes: ["hunt"], blurb: "Public models" },
  { id: "npm", label: "npm", category: "packages", modes: ["hunt"], blurb: "JavaScript packages" },
  { id: "crates", label: "crates.io", category: "packages", modes: ["hunt"], blurb: "Rust crates" },
  { id: "rubygems", label: "RubyGems", category: "packages", modes: ["hunt"], blurb: "Ruby gems" },
  { id: "packagist", label: "Packagist", category: "packages", modes: ["hunt"], blurb: "PHP packages" },
  { id: "nuget", label: "NuGet", category: "packages", modes: ["hunt"], blurb: ".NET packages" },
  { id: "hex", label: "Hex", category: "packages", modes: ["hunt"], blurb: "Elixir packages" },
  { id: "arxiv", label: "arXiv", category: "papers", modes: ["hunt"], blurb: "Preprints" },
  { id: "crossref", label: "Crossref", category: "papers", modes: ["hunt"], blurb: "DOI-registered works" },
  { id: "doaj", label: "DOAJ", category: "papers", modes: ["hunt"], blurb: "Open-access articles" },
  { id: "pubmed", label: "PubMed", category: "papers", modes: ["hunt"], blurb: "Biomedical citations" },
  { id: "archive", label: "Internet Archive", category: "archive", modes: ["hunt"], blurb: "Archived items" },
  { id: "openlibrary", label: "Open Library", category: "archive", modes: ["hunt"], blurb: "Books" },
  { id: "musicbrainz", label: "MusicBrainz", category: "archive", modes: ["hunt"], blurb: "Public music metadata" },
  { id: "nominatim", label: "OpenStreetMap", category: "places", modes: ["hunt"], blurb: "Place names" },
  { id: "nvd", label: "NVD", category: "infra", modes: ["hunt"], blurb: "Public CVE records" },
  { id: "sec", label: "SEC EDGAR", category: "infra", modes: ["hunt"], blurb: "Public US filings" },
  { id: "urlscan", label: "urlscan", category: "infra", modes: ["hunt"], blurb: "Public URL scans for a domain" },
  { id: "crt", label: "crt.sh", category: "infra", modes: ["hunt"], blurb: "Certificate transparency for a domain" },
  { id: "gh-user", label: "GitHub", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "gl-user", label: "GitLab", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "cb-user", label: "Codeberg", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "hn-user", label: "Hacker News", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "kb-user", label: "Keybase", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "devto-user", label: "DEV", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "crates-user", label: "crates.io", category: "identity", modes: ["username"], blurb: "Profile by handle" },
  { id: "chess-user", label: "Chess.com", category: "identity", modes: ["username"], blurb: "Public player" },
  { id: "lichess-user", label: "Lichess", category: "identity", modes: ["username"], blurb: "Public player" },
  { id: "docker-user", label: "Docker Hub", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "hf-user", label: "Hugging Face", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "bsky-user", label: "Bluesky", category: "identity", modes: ["username"], blurb: "Handle or name.bsky.social" },
  { id: "lemmy-user", label: "Lemmy", category: "identity", modes: ["username"], blurb: "lemmy.world account" },
  { id: "codewars-user", label: "Codewars", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "bb-user", label: "Bitbucket", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "lp-user", label: "Launchpad", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "gems-user", label: "RubyGems", category: "identity", modes: ["username"], blurb: "Public profile" },
  { id: "masto-user", label: "Mastodon", category: "identity", modes: ["username"], blurb: "mastodon.social account" },
  { id: "modrinth-user", label: "Modrinth", category: "identity", modes: ["username"], blurb: "Public user" },
  { id: "wiki-user", label: "Wikipedia", category: "identity", modes: ["username"], blurb: "Editor account" },
  { id: "npm-user", label: "npm", category: "identity", modes: ["username"], blurb: "Packages maintained by the handle" },
  { id: "gravatar", label: "Gravatar", category: "identity", modes: ["username"], blurb: "Only when the query is an email" },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  web: "Web",
  community: "Community",
  code: "Code",
  packages: "Packages",
  papers: "Papers",
  archive: "Archives",
  places: "Places",
  infra: "Infrastructure",
  identity: "Profiles",
};
