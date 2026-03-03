# 🤖 JobBot — Discord Bot for IT Alternance Jobs

A Discord bot that **automatically finds IT alternance (apprenticeship) job postings**, filters them using AI, and posts them to dedicated channels — organized by field of study.

---

## 🧠 How It Works

### 1. 🔍 Job Search — Keyword Rotation System

**The challenge:** The job platform's public search API is imprecise when using broad queries. A single generic search returns noisy, irrelevant results that are hard to filter reliably after the fact.

**The solution:** Instead of one vague query, the bot maintains a **large list of specific IT keywords** (70+ terms covering Data, Dev, Cloud, Cybersecurity, etc.) and rotates through them one at a time. Each run uses a single, targeted search URL built around that keyword, combined with alternance-related terms. This ensures high precision per search, and full coverage of all IT fields over the course of a day.

The rotation is automatically paced so that **every keyword is used exactly once per 24 hours**.

---

### 2. 🤖 AI Filtering — Groq + LLaMA 3.3 70B

Raw search results still include false positives (non-IT roles, wrong education level, etc.). Each candidate job is passed through **Groq's API** running the **LLaMA 3.3 70B** model for a structured analysis.

The AI is prompted to evaluate the offer against strict criteria:
- ✅ Is it a purely **IT role**?
- ✅ Is the target level **Master / Bac+5 / Engineering school**? (Bac+2/3, BTS, DUT → rejected)

If the offer passes, the AI also extracts:
- 📌 **Contract duration** (from the title/description, or "Non précisée")
- 🎓 **Field of study** from a fixed list: `LSI`, `RS`, `BDML`, `Transverse`
- 🏢 **Company size** (estimated from the company name)
- 🏭 **Business sector** (e.g. Defense, Banking, ESN...)
- 📋 **Mission summary** — a 2-3 sentence description of typical tasks and tools

The model responds with a strict JSON object. The bot parses it and discards any offer where `valide: false`.

#### Why Groq?

I chose **Groq** mainly because it offers one of the best **free-tier / low-cost** options to run a strong LLM for this kind of pipeline:

- **Generous free access** (useful when the bot may analyze many offers per day)
- **Very fast inference** (low latency → the bot can process and post results quickly)
- **High-quality open models available** (here: `llama-3.3-70b-versatile`)
- **Simple API + solid Node.js integration** (easy to plug into an automated JSON-only workflow)

This makes Groq a great fit for “high-volume filtering” where you want **reliable structured outputs** without spending money on tokens.

---

### 3. 📢 Smart Channel Routing

Each validated offer is sent to the **right Discord channels** based on the AI-detected field:

| Field | Description |
|---|---|
| `LSI` | Software Engineering / Development / Information Systems |
| `RS` | Networks / Security / Infrastructure / Cloud |
| `BDML` | Data Science / AI / Machine Learning |
| `Transverse` | Project Management / Business Analyst / Agile |

Every offer is always posted to the **main channel**, and also copied to its specific field channel.

---

### 4. 📋 Discord Embed Cards

Each job post is displayed as a **rich Discord embed** with:

<img width="528" height="214" alt="image" src="https://github.com/user-attachments/assets/8bddc43b-85f8-4659-809e-0893faecf5e3" />

The card title is a **clickable link** to the original job posting.

---

### 5. 🔗 `/match` Slash Command

Users can manually submit any job posting URL directly in Discord. The bot will:
1. Scrape the full job description from the page
2. Run it through the same AI analysis (with the description, for more accuracy)
3. Reply with the embed card or a rejection reason

---

## 📦 Prerequisites

Before running the bot, you need to set up the following external services:

### 🤖 Discord Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Bot → copy the **Token**
3. Enable **Server Members Intent** and **Message Content Intent**
4. Invite the bot to your server with `applications.commands` + `bot` scopes and `Send Messages` / `Embed Links` permissions

### 🧠 Groq API
1. Sign up at [console.groq.com](https://console.groq.com)
2. Generate an API key (free tier available)
3. The bot uses the `llama-3.3-70b-versatile` model — no billing required on the free plan for this usage

### 🌐 Browserless *(optional but recommended for hosted deployments)*
Running a full headless Chrome browser on a low-resource server (e.g. 512MB RAM) is not feasible. Instead, the bot can delegate all browser work to **[Browserless.io](https://browserless.io)**, a remote headless Chrome service.

1. Create a free account at [browserless.io](https://browserless.io)
2. Copy your **API token**
3. Set `BROWSERLESS_TOKEN` in your `.env`

With `BROWSERLESS_TOKEN` set, the bot connects via WebSocket to the remote browser instead of launching one locally. Without it, Puppeteer will try to launch a local Chrome instance (requires a capable machine).

---

## ⚙️ Setup

### 1. Clone the repo

```bash
git clone https://github.com/Tarek94000/JobBot.git
cd JobBot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your own values:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Main channel ID (all jobs posted here) |
| `GROQ_API_KEY` | API key from [console.groq.com](https://console.groq.com) |
| `BROWSERLESS_TOKEN` | *(Optional)* [browserless.io](https://browserless.io) token for remote scraping |
| `CHANNEL_LSI` | Channel ID for Software/Dev jobs |
| `CHANNEL_RS` | Channel ID for Networks/Security/Cloud jobs |
| `CHANNEL_BDML` | Channel ID for Data/AI/ML jobs |
| `CHANNEL_TRANSVERSE` | Channel ID for PM/BA/Agile jobs |

### 4. Run the bot

```bash
node index.js
```

---

---

## 🚀 Deployment on KataBump

[KataBump](https://katapult.io) (or any Linux VPS) is a good option for hosting the bot 24/7 on a free or low-cost tier.

### Steps

1. **SSH into your server**
```bash
ssh user@your-server-ip
```

2. **Install Node.js** (if not already installed)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone the repo and install dependencies**
```bash
git clone https://github.com/Tarek94000/JobBot.git
cd JobBot
npm install
```

4. **Create and fill your `.env`**
```bash
cp .env.example .env
nano .env
```

> ⚠️ Make sure to set `BROWSERLESS_TOKEN` — launching a local Chrome on a low-RAM server will crash.

5. **Run persistently with PM2**
```bash
npm install -g pm2
pm2 start index.js --name jobbot
pm2 save
pm2 startup
```

The bot will now survive reboots and restart automatically if it crashes.

---

## 🛠️ Tech Stack

| Tool | Role |
|---|---|
| [discord.js](https://discord.js.org/) | Discord bot framework |
| [Puppeteer](https://pptr.dev/) | Headless browser for web scraping |
| [Cheerio](https://cheerio.js.org/) | HTML parsing |
| [Groq SDK](https://console.groq.com/) | LLaMA 3.3 70B for AI filtering |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variable management |

---

## 🔐 Security

Secrets (tokens, API keys, channel IDs) are stored in `.env` which is excluded from version control via `.gitignore`. A `.env.example` template is provided.

---

## 📄 License

MIT
