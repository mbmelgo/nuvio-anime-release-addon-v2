# AniBloom — Anime Discovery for Nuvio

<p align="center">
  <img src="assets/anibloom-icon.png" alt="AniBloom logo" width="128" />
</p>

[![Nuvio](https://img.shields.io/badge/Nuvio-addon-ff6f61.svg)](https://nuvio.tv)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Version](https://img.shields.io/badge/version-2.11.0-blue.svg)](https://github.com/AniBloomHQ/AniBloom/releases)

> Where anime blooms.

**AniBloom is a catalog-only addon for Nuvio.** It helps you discover anime through eight focused catalogs for upcoming episodes, recently aired episodes, and seasonal releases—including movies.

[Install AniBloom](https://anibloom.vercel.app/manifest.json) · [Homepage](https://anibloom.vercel.app/) · [Support the addon](https://buymeacoffee.com/mark475) · [Releases](https://github.com/AniBloomHQ/AniBloom/releases)

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

### Anime title preferences

The homepage offers three fixed public manifest URLs. Select a display style before installing:

| Preference | Manifest URL | Catalog names |
| --- | --- | --- |
| English (default) | `https://anibloom.vercel.app/manifest.json` | English |
| Romaji | `https://anibloom.vercel.app/romaji/manifest.json` | English |
| Native | `https://anibloom.vercel.app/native/manifest.json` | Japanese |

English titles fall back to Romaji, then Native; Romaji titles fall back to English, then Native; Native titles fall back to Romaji, then English. Native means the original writing system (not always Japanese).

All variants share the same eight catalog IDs, media identities, search, pagination, and upstream processing. No user accounts, unique manifests, or server-side language preferences are created. Nuvio may treat each URL as a separate installation: remove the old variant when switching to avoid duplicates. Nuvio or a separate metadata provider may override titles shown on detail pages; AniBloom controls its catalog responses, not Nuvio's application language.


## Self-hosting

You can run your own AniBloom instance instead of using the public deployment. The project supports local development with its included Node.js preview server and deployment to your own Vercel project.

### Requirements

- Node.js 20 or newer
- npm
- Git

### Option 1: Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/AniBloomHQ/AniBloom.git
   cd AniBloom
   ```

2. Install the project dependencies:

   ```bash
   npm install
   ```

3. Start the local server:

   ```bash
   npm run dev
   ```

   The server listens on port `3000` by default. Open [http://localhost:3000](http://localhost:3000) to view the homepage.

   To use a different port, set the `PORT` environment variable before starting the server. For example:

   ```bash
   PORT=8080 npm run dev
   ```

4. Use your local manifest URL in Nuvio:

   ```text
   http://localhost:3000/manifest.json
   ```

   If Nuvio runs on a different device, `localhost` refers to that device—not the computer hosting AniBloom. In that case, use the host computer's reachable LAN address and ensure its firewall allows the chosen port. Only expose the server to networks you trust.

The local preview server implements the homepage, manifest, version, catalog, and static asset routes. It is intended for local use and development; use the Vercel deployment option below for a public, serverless instance.

### Option 2: Deploy to your own Vercel project

1. Create or sign in to a [Vercel account](https://vercel.com/signup).
2. Install the Vercel CLI:

   ```bash
   npm install --global vercel
   ```

3. Clone the repository if you have not already, then open its directory:

   ```bash
   git clone https://github.com/AniBloomHQ/AniBloom.git
   cd AniBloom
   ```

4. Link the local project to a new Vercel project and follow the prompts:

   ```bash
   vercel link
   ```

   Choose or create the Vercel project you want to use. Keep the project root directory set to the repository root. AniBloom uses the included `vercel.json` rewrites and `api/` serverless functions; do not set a separate output directory.

5. Deploy a preview to verify the setup:

   ```bash
   vercel
   ```

6. When the preview works, deploy to production:

   ```bash
   vercel --prod
   ```

7. Copy your deployment's manifest URL into Nuvio:

   ```text
   https://YOUR-VERCEL-DOMAIN/manifest.json
   ```

   Replace `YOUR-VERCEL-DOMAIN` with the domain assigned to your Vercel project or a custom domain you have configured.

### Optional environment variable

Set `DONATION_URL` in your Vercel project's environment variables to configure the homepage's **Support development** link. The value must be an HTTPS URL. If it is missing or invalid, the homepage falls back to `https://buymeacoffee.com/mark475`. Configure the variable separately for each environment where you want a custom destination.

Vercel may ask you to confirm project settings during the first deployment. Use the repository root, Node.js 20 or newer, and no custom build or output directory unless Vercel's current project setup specifically requires otherwise. Review your own Vercel plan's function, bandwidth, and usage limits; those limits and any associated costs are controlled by your account.

### Keeping your instance updated

To update your self-hosted copy, pull the latest changes from the repository:

```bash
git pull
npm install
```

For a local instance, restart the server after updating. For Vercel, run `vercel --prod` again from the linked project directory after pulling the changes.

## Support the public instance

The public AniBloom instance is currently hosted on Vercel's **Hobby plan**. Its resource and usage limits may affect response times or availability during periods of higher traffic.

If community donations become sufficient, I may move the public instance to a higher Vercel plan for more generous resource and usage limits. An upgrade may help accommodate more traffic, although it cannot guarantee faster responses in every situation.

If AniBloom is useful to you, you can support its ongoing maintenance and hosting through [Buy Me a Coffee](https://buymeacoffee.com/mark475). Donations are optional. You can also use the self-hosting instructions above and run your own instance.

## Privacy and operations

- [Public privacy and service-data disclosure](https://anibloom.vercel.app/privacy.html)
- [Operational incident-response runbook](docs/operations-incident-response.md)
- [Catalog upstream resilience](docs/catalog-resilience.md)

## Development

AniBloom is a JavaScript serverless addon deployed on Vercel.

- **Production:** `v2.10.0`
- **Development:** `v2.11.0`

Run the automated test suite:

```bash
npm install
npm test
```

## License

AniBloom is licensed under the MIT License. See [LICENSE](LICENSE).
