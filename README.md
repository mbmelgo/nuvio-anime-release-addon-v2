# AniBloom — Anime Discovery for Nuvio

<p align="center">
  <img src="assets/anibloom-icon.png" alt="AniBloom logo" width="128" />
</p>

[![Nuvio](https://img.shields.io/badge/Nuvio-addon-ff6f61.svg)](https://nuvio.tv)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Version](https://img.shields.io/badge/version-1.133.0-blue.svg)](https://github.com/mbmelgo/AniBloom/releases)

> Where anime blooms.

**AniBloom is a catalog-only addon for Nuvio.** It helps you discover anime through focused catalogs for upcoming episodes, recently aired episodes, and seasonal releases—including movies.

[Install AniBloom](https://anibloom.vercel.app/manifest.json) · [Homepage](https://anibloom.vercel.app/) · [Support the addon](https://anibloom.vercel.app/#support) · [Releases](https://github.com/mbmelgo/AniBloom/releases)

## What AniBloom is

AniBloom organizes anime discovery into eight catalogs:

| Anime series | Recent releases & movies |
| --- | --- |
| Upcoming 3 days | Previous 3 days |
| Current Season | Current Season Movies |
| Previous Season | Previous Season Movies |
| Upcoming Season | Upcoming Season Movies |

The catalogs help you find upcoming episodes, recently aired episodes, and anime from the current, previous, and upcoming seasons.

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

If AniBloom is useful to you, you can support its ongoing maintenance through the [Support the addon section on the homepage](https://anibloom.vercel.app/#support).

## Development

AniBloom is a JavaScript serverless addon deployed on Vercel.

- **Production:** `v1.133.0`
- **Development:** `v1.133.0`

Requirements: Node.js 20 or newer and npm.

Run the automated test suite:

```bash
npm install
npm test
```

## License

AniBloom is licensed under the MIT License. See [LICENSE](LICENSE).
