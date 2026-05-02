Deployment notes
================

Front-end (Vercel)
- Push this repo to GitHub.
- In Vercel, create a new project and import the GitHub repo.
- Configure:
  - Root directory: project root (default)
  - Framework preset: "Other" or let Vercel auto-detect (Vite + React will be detected)
  - Build command: `npm run build`
  - Output directory: `dist`

Notes: The front-end (`src/`) is a Vite + React app and deploys fine to Vercel.

Environment variable (important)
- Set `VITE_BACKEND_URL` in Vercel Environment Variables to the public URL of your backend (e.g. `https://my-backend.example.com`).
- This app uses `import.meta.env.VITE_BACKEND_URL` at build time to target the solver API. If not set, it falls back to `http://localhost:8000` for local dev.

Back-end (recommendation)
- This project backend uses Python + FastAPI and native packages (OpenCV, NumPy).
- Vercel serverless functions are generally unsuitable for heavy native binaries and large Python wheels (size/runtime limits).

Recommended options for the backend:
1) Render / Railway / Fly / Heroku (recommended): create a Python service and point it at `backend/`.
   - Add `requirements.txt` (included) to the repo root so the host can `pip install -r requirements.txt`.
   - Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

2) Docker-based deploy (if you need a custom system image): build a Docker image with OpenCV and deploy to services that support containers (Render, Fly, Railway with Docker, or a VPS).

Local run (development)
-----------------------
Front-end:
```bash
npm install
npm run dev
```

Back-end:
```bash
python -m pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

If you want, I can:
- Create a `vercel.json` for the front-end.
- Create a Dockerfile for the backend.
- Draft step-by-step Render or Railway deployment settings.
