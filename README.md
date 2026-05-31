This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Install dependencies:

```bash
npm install
```

Start the Next.js app and Socket.IO signaling server together:

```bash
npm run dev
```

This runs:

- Next.js on [http://localhost:3000](http://localhost:3000)
- Socket.IO signaling server on `http://localhost:3001`

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment Variables

Create `.env.local` for local development:

```bash
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_TURN_URL=turn:your-turn-server.example.com:3478
NEXT_PUBLIC_TURN_USERNAME=your-turn-username
NEXT_PUBLIC_TURN_CREDENTIAL=your-turn-password
```

`NEXT_PUBLIC_SOCKET_URL` must point to the Socket.IO signaling server URL. If it is not set, the app falls back to `http://localhost:3001`.

TURN is optional. If `NEXT_PUBLIC_TURN_URL` is not set, WebRTC uses the built-in STUN server only. Set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` when you need TURN relay support.

For production deployments such as Vercel, Render, or Railway, set `NEXT_PUBLIC_SOCKET_URL` in the platform environment variables to the public HTTPS URL of the Socket.IO server, for example:

```bash
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.example.com
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
