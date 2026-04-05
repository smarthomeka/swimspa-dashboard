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

2. Start the dashboard:

```bash
docker compose up -d
```

The dashboard is available at [http://localhost:3000](http://localhost:3000).

To rebuild after updates:

```bash
docker compose up -d --build
```

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

## Tech Stack

- [Next.js 16](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Drizzle ORM](https://orm.drizzle.team/) + SQLite (better-sqlite3)
- [Recharts](https://recharts.org/) for data visualization
- [shadcn/ui](https://ui.shadcn.com/) components
