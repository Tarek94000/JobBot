# 🤖 JobBot — Discord Bot for IT Alternance Jobs

A Discord bot that automatically scrapes LinkedIn for IT alternance (apprenticeship) job postings, filters them using AI, and posts them to dedicated Discord channels.

## ✨ Features

- 🔍 **LinkedIn Scraping** — Searches LinkedIn jobs using a rotating list of IT keywords (Data, Dev, Cloud, Cybersecurity...)
- 🤖 **AI Filtering** — Uses **Groq (LLaMA 3.3 70B)** to validate if each offer is truly IT-focused and at Master/Engineer level
- 📢 **Smart Routing** — Posts each job to the right Discord channel based on its field (LSI, RS, BDML, Transverse)
- 📋 **Rich Embeds** — Each job post shows company, estimated headcount, sector, contract duration, and a mission summary
- ⏱️ **Scheduled Rotation** — Automatically cycles through all keywords once per day
- 🔗 **`/match` Command** — Manually analyze any LinkedIn job URL directly in Discord

## 🗂️ Project Structure

```
JobBot/
├── index.js          # Main bot logic
├── .env              # Secret tokens (NOT committed)
├── .env.example      # Template for environment variables
├── .gitignore        # Ignores .env and node_modules
├── package.json
└── README.md
```

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

Then edit `.env` and fill in your own values:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Main channel ID where all jobs are posted |
| `GROQ_API_KEY` | API key from [console.groq.com](https://console.groq.com) |
| `BROWSERLESS_TOKEN` | *(Optional)* Token from [browserless.io](https://browserless.io) for remote scraping |
| `CHANNEL_LSI` | Channel ID for Software/Dev jobs |
| `CHANNEL_RS` | Channel ID for Networks/Security/Cloud jobs |
| `CHANNEL_BDML` | Channel ID for Data/AI/ML jobs |
| `CHANNEL_TRANSVERSE` | Channel ID for PM/BA/Agile jobs |

### 4. Run the bot

```bash
node index.js
```

## 🛠️ Tech Stack

- [discord.js](https://discord.js.org/) — Discord bot framework
- [Puppeteer](https://pptr.dev/) — Headless browser for LinkedIn scraping
- [Cheerio](https://cheerio.js.org/) — HTML parsing
- [Groq SDK](https://console.groq.com/) — LLaMA 3.3 70B for AI filtering
- [dotenv](https://github.com/motdotla/dotenv) — Environment variable management

## 🔐 Security

The `.env` file containing all secrets is excluded from version control via `.gitignore`. Never commit your `.env` file.

## 📬 Discord Commands

| Command | Description |
|---|---|
| `/match <url>` | Analyze a specific LinkedIn job URL with the AI |

## 📄 License

MIT
