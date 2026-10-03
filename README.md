# Maru AI

Maru AI adalah workspace chat berbasis Next.js App Router + TypeScript.

## Stack
- Next.js 16
- React 19
- TypeScript
- MAX Router sebagai backend AI
- Railway sebagai deployment target

## Environment
- MAX_ROUTER_URL: URL dasar MAX Router, misalnya https://max-router-production.up.railway.app/v1
- PORT: disediakan Railway

## Lokal
npm install
npm run dev

Health check: /api/health
Model list: /api/models
Chat API: /api/chat
