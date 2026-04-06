# SwimSpa Dashboard

Web dashboard for monitoring and managing an Armstark Lotus 460 SwimSpa. Built with Next.js 16, React 19, and SQLite.

## Features

- Real-time spa status monitoring (temperature, pumps, jets)
- Water chemistry tracking via Labcom PoolLab integration
- Energy consumption monitoring via Shelly 3EM
- Chemical dosing calculator
- Historical data charts

## Quick Start (Docker)

1. Copy the environment template and fill in your API keys:

```bash
cp .env.example .env
```

2. Pull and start the dashboard:

```bash
docker compose pull
docker compose up -d
```

The dashboard is available at [http://localhost:3000](http://localhost:3000).

Data is stored in `./data` by default. To use a custom path (e.g. a NAS volume), set `DATA_PATH` in your `.env` file.

To update to the latest version:

```bash
docker compose pull
docker compose up -d
```

### GHCR Authentication

The Docker image is hosted on GitHub Container Registry (`ghcr.io`).

**If the package is public** (recommended), no authentication is needed — `docker compose pull` works out of the box.

**If you get a `401 unauthorized` error** when pulling, the package is still private. Either:

- **Make it public** (repo owner, one-time): Go to [Package Settings](https://github.com/users/smarthomeka/packages/container/swimspa-dashboard/settings) → Change visibility to **Public**
- **Or log in to GHCR** on the machine:
  ```bash
  echo YOUR_GITHUB_PAT | docker login ghcr.io -u smarthomeka --password-stdin
  ```
  Requires a [GitHub Personal Access Token](https://github.com/settings/tokens) with `read:packages` scope.

### Ugreen NAS Deployment

On a Ugreen NAS running UGOS:

1. Create a shared folder (e.g. `swimspa`) and set the volume path in `.env`:
   ```bash
   DATA_PATH=/volume1/swimspa
   ```

2. Pull and start:
   ```bash
   docker compose pull
   docker compose up -d
   ```

The SQLite database and all persistent data will be stored on the NAS volume.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `GECKO_API_URL` | Gecko in.Touch 2 API endpoint |
| `GECKO_API_KEY` | Gecko API key |
| `LABCOM_API_URL` | Labcom PoolLab cloud API endpoint |
| `LABCOM_API_KEY` | Labcom API key |
| `SHELLY_HOST` | Shelly 3EM local network address |
| `BLUECONNECT_API_URL` | BlueConnect API endpoint |
| `BLUECONNECT_API_KEY` | BlueConnect API key |
| `DATA_PATH` | Data volume path for persistent storage (default: `./data`) |

## Tech Stack

- [Next.js 16](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Drizzle ORM](https://orm.drizzle.team/) + SQLite (better-sqlite3)
- [Recharts](https://recharts.org/) for data visualization
- [shadcn/ui](https://ui.shadcn.com/) components
