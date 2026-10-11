# 🚀 Live Vercel Deployment & Cloud Sync Guide

**Sparsh Typing Tutor (Kruti Dev / DevLys 010)** is now fully cloud-ready for **Vercel** with user authentication, persistent cloud storage, and AI weakness coaching so you can practice from **any device, anywhere in the world** without depending on your local machine.

---

## 🔑 Your Login Credentials
- **Username**: `kalpesh`
- **Default Password**: `kalpesh123`
*(All your previous 24 stars, keystroke timing telemetry, and exam attempt history are pre-loaded into this account!)*

---

## Option 1: 1-Minute Deployment via Vercel CLI

Since the Vercel CLI is already installed on your machine, simply run:

```powershell
vercel
```

1. **Set up and deploy?** Press `y` (Yes).
2. **Which scope?** Select your Vercel account.
3. **Link to existing project?** Type `n` (No).
4. **Project name?** Press Enter (e.g. `sparsh-typing`).
5. **Directory?** Press Enter (`./`).
6. **Want to modify settings?** Press `n` (No).

Your site will immediately be live at `https://sparsh-typing.vercel.app` (or your assigned URL)!

To deploy to production directly:
```powershell
vercel --prod
```

---

## Option 2: 1-Click Deployment via GitHub & Vercel Dashboard

1. Push this folder to a GitHub repository:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit for Sparsh Vercel deployment"
   git remote add origin https://github.com/<your-username>/sparsh-typing.git
   git push -u origin main
   ```
2. Open **[vercel.com](https://vercel.com)** and click **"Add New..." > "Project"**.
3. Import your `sparsh-typing` repository.
4. Click **Deploy**.

---

## ☁️ Persistent Cloud Storage Setup (1-Click Vercel KV)

Vercel provides free persistent cloud storage (**Vercel KV / Upstash Redis**) so that your scores, stars, and history are saved permanently in the cloud:

1. In your project on **[vercel.com](https://vercel.com)**, click the **Storage** tab.
2. Click **Create Database** > Select **KV (Serverless Redis)**.
3. Name it (e.g. `sparsh-kv`) and click **Create**.
4. Click **Connect to Project** and select your `sparsh-typing` project.
5. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your project!

*(Even before connecting KV, the app automatically syncs with your browser's persistent storage and has a `💾 Backup` button to export/import JSON anytime.)*

---

## 🤖 Optional: Enable Cloud AI Coach on Vercel
In your Vercel Project Dashboard:
1. Go to **Settings > Environment Variables**.
2. Add:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Your Google Gemini API key (from `gemini.key`).
3. Click **Save** and redeploy.

---

## ✨ Features Available Anywhere on Live URL
- **57-Level TypingClub Progression**: Home Row $\rightarrow$ Top Row $\rightarrow$ Bottom Row $\rightarrow$ Matras $\rightarrow$ Halves $\rightarrow$ Conjuncts $\rightarrow$ Exam Passages.
- **Fluid Keyboard Navigation**: Press **Enter** or **Space** to start immediately without touching the mouse; press **Enter** on result screen to advance directly to the next level.
- **⚡ AI Weakness Sprints**: Tailored 16-word sprints focusing on your slowest keys and pauses in milliseconds.
- **🎯 RSSB LDC Hindi Exam Simulator**: 10-minute 400-word passage simulation under strict exam rules (word lock, 0.0625 marks/word).
- **Multi-Device Cloud Sync**: Log in on your phone, laptop, or desktop library computer and all progress stays 100% in sync!
