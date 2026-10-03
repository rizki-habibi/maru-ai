# Maru AI

Maru AI adalah antarmuka percakapan bergaya ChatGPT untuk ekosistem MAX.

## Integrasi

- **MAX Router** menjadi gateway model melalui OpenAI-compatible API.
- **MAX Editor** menjadi workspace coding terpisah yang dapat dibuka langsung dari Maru.
- Maru menyimpan API key MAX Router hanya di server melalui environment variable, bukan di browser.
- Chat mendukung streaming SSE dari MAX Router.
- Riwayat percakapan disimpan lokal di browser.

## Environment

- `MAX_ROUTER_URL` — default `https://max-router-production.up.railway.app/v1`
- `MAX_ROUTER_API_KEY` — API key MAX Router, opsional bila endpoint router tidak mewajibkan key.
- `MAX_EDITOR_URL` — default `https://max-editor-production.up.railway.app`
- `MARU_ACCESS_TOKEN` — opsional, melindungi API Maru dengan Bearer token.

## Jalankan

```bash
npm install
npm start
```

Health: `/api/health`.

## Arsitektur

Browser → Maru AI → MAX Router → provider/model

Browser → MAX Editor untuk workspace coding.

Jangan menaruh API key provider di frontend.