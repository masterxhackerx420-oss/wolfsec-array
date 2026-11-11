# WolfSec Array

Public multi-engine web hunter. One query fans out across web, code, package, paper, news, archive, filing, and profile indexes, then comes back as titles, URLs, snippets, and mention marks.

WolfSec Array is not a people-search broker. It does not rotate proxies, buy data, or treat a hit as proof.

## Indexes

Mentions mode covers DuckDuckGo, Wikipedia, Wikidata, Wikimedia Commons, Google News, Bluesky, Hacker News, Stack Overflow, GitHub, GitLab, Hugging Face, npm, crates.io, RubyGems, Packagist, NuGet, Hex, arXiv, Crossref, DOAJ, PubMed, the Internet Archive, Open Library, MusicBrainz, OpenStreetMap, NVD, SEC EDGAR, urlscan, and crt.sh.

Username mode checks public profile APIs, including GitHub, GitLab, Codeberg, Hacker News, Keybase, DEV, crates.io, Chess.com, Lichess, Docker Hub, Hugging Face, Bluesky, Lemmy, Codewars, Bitbucket, Launchpad, RubyGems, Mastodon, Modrinth, Wikipedia, npm, and Gravatar (email only).

Certificate and urlscan lookups run when the query contains a domain.

## Run

```sh
npm install
npm run dev
```

The desk listens on port 8080.

## Export

A finished hunt can be saved from the desk as JSON, CSV, or Markdown.
