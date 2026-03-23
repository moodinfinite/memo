# Memo — Phase 3

## Quick start
```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase setup — run SQL files in this order
1. `supabase/schema.sql`
2. `supabase/rpc.sql`
3. `supabase/schema-p3.sql`
4. `supabase/schema-srs.sql`

## What's new in Phase 3
- Folders — organise sets into named folders, shown in sidebar
- Pinned sets — pin important sets to the top of home
- Spaced repetition (SM-2) — due cards surface first, intervals grow with correct answers
- Shuffle toggle — randomise card order before each session
- Countdown timer — set 1/3/5/10 min target, turns red under 30s, auto-ends at zero
- Success animations — count-up for sub-100%, card stack + 100% stamp for perfect
- Keyboard shortcuts — Space flip, ← still learning, → got it

## Deploying to Vercel

### Step 1 — GitHub
1. Go to github.com, sign up, click New repository
2. Name it `memo`, set Private, click Create

### Step 2 — Push from Terminal
```bash
git init
git add .
git commit -m "memo phase 3"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/memo.git
git push -u origin main
```
Replace YOUR-USERNAME with your GitHub username.

### Step 3 — Vercel
1. Go to vercel.com, sign up with GitHub
2. Click Add New Project, select your memo repo
3. Vite is auto-detected — no config needed
4. Before deploying, click Environment Variables and add:
   - VITE_SUPABASE_URL = your Supabase project URL
   - VITE_SUPABASE_ANON_KEY = your anon key
5. Click Deploy — live in ~60 seconds

## Design tokens
- Accent: #84cc16 (lime green)
- Font: Inter
- Card flip: vertical rotateX 0.32s cubic-bezier(0.4,0,0.2,1)
- Streak unit: weeks
