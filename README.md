# AniBloom — Anime Discovery for Nuvio

<p align="center">
  <img src="assets/anibloom-icon.png" alt="AniBloom logo" width="128" />
</p>

[![Nuvio](https://img.shields.io/badge/Nuvio-addon-ff6f61.svg)](https://nuvio.tv)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/mbmelgo/AniBloom/releases)

> Where anime blooms.

**AniBloom is a catalog-only addon for Nuvio.** It helps you discover anime through eight focused catalogs for upcoming episodes, recently aired episodes, and seasonal releases—including movies.

[Install AniBloom](https://anibloom.vercel.app/manifest.json) · [Homepage](https://anibloom.vercel.app/) · [Support the addon](https://buymeacoffee.com/melgom475) · [Releases](https://github.com/mbmelgo/AniBloom/releases)

## What AniBloom is

AniBloom brings these eight catalogs together in one list:

- **Upcoming 3 days** — Anime with new episodes airing in the next 3 days.
- **Previous 3 days** — Anime that aired in the last 3 days.
- **Current Season** — Anime in the current season.
- **Current Season Movies** — Movies from the current season.
- **Previous Season** — Anime from the recently ended season.
- **Previous Season Movies** — Movies from the recently ended season.
- **Upcoming Season** — Anime from the next upcoming season.
- **Upcoming Season Movies** — Movies from the next upcoming season.

## What AniBloom is not

AniBloom is not a streaming service, media host, or metadata provider. It does not host, store, stream, or distribute anime. It also does not provide detailed metadata such as descriptions, artwork, or episode information.

Install a separate compatible metadata provider in Nuvio to supply detailed title information and artwork. Examples include **ioametadata**, **Xperience**, and **BingeCat**.

## Installation

1. Open the AniBloom [homepage](https://anibloom.vercel.app/).
2. Select **Add to Nuvio**, or copy the manifest URL below into Nuvio.

```text
https://anibloom.vercel.app/manifest.json
```

For manual installation, use the same manifest URL.

## Support the addon

If AniBloom is useful to you, you can support its ongoing maintenance through [Buy Me a Coffee](https://buymeacoffee.com/melgom475).

## Development

AniBloom is a JavaScript serverless addon deployed on Vercel.

- **Production:** `v2.0.0`
- **Development:** `v2.0.0`

Requirements: Node.js 20 or newer and npm.

Run the automated test suite:

```bash
npm install
npm test
```

## License

AniBloom is licensed under the MIT License. See [LICENSE](LICENSE).
