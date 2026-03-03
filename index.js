require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, Events, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const cron = require('cron');
const Groq = require('groq-sdk');

// Configuration du client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// IDs des channels spécifiques par filière (chargés depuis .env)
const CHANNELS = {
    "LSI": process.env.CHANNEL_LSI,
    "RS": process.env.CHANNEL_RS,
    "BDML": process.env.CHANNEL_BDML,
    "Transverse": process.env.CHANNEL_TRANSVERSE
};

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID || client.user?.id; // L'ID du bot / application
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Initialisation de Groq
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Les mots-clés d'exclusion
const EXCLUDE_KEYWORDS = [
    'pharmacie', 'achats', 'rh', 'ressources', 'marketing', 'commercial',
    'vente', 'communication', 'comptabilité', 'finance', 'presse',
    'produit', 'qualité matière', 'conformité', 'juridique', 'audit',
    'pharmacométrie', 'acheteur', 'chimie', 'magasinier', 'achat', 'cuisinier', 'styliste'
];

// Rotation des mots clés de recherche dynamiques
const SEARCH_KEYWORDS = [

    // 📊 Data / IA
    '"data%20analyst"',
    '"data%20engineer"',
    '"data%20scientist"',
    '"data%20science"',
    '"machine%20learning"',
    '"deep%20learning"',
    '"big%20data"',
    '"business%20analyst"',
    '"business%20intelligence"',
    '"power%20bi"',
    '"tableau"',
    '"etl"',
    '"python"',
    '"r%20language"',
    '"sql"',
    '"IA"',

    // 💻 Développement
    '"developpeur"',
    '"développeur"',
    '"software%20engineer"',
    '"software%20developer"',
    '"fullstack"',
    '"full%20stack"',
    '"backend"',
    '"frontend"',
    '"web%20developer"',
    '"mobile%20developer"',
    '"application%20developer"',
    '"java"',
    '"spring"',
    '"c%23"',
    '".net"',
    '"javascript"',
    '"typescript"',
    '"react"',
    '"angular"',
    '"vue"',
    '"nodejs"',
    '"nestjs"',
    '"php"',
    '"symfony"',
    '"api"',
    '"microservices"',

    // ☁️ Cloud / DevOps
    '"cloud"',
    '"aws"',
    '"azure"',
    '"gcp"',
    '"devops"',
    '"docker"',
    '"kubernetes"',
    '"terraform"',
    '"ci%2Fcd"',
    '"linux"',

    // 🔐 Cybersécurité / Réseaux
    '"cybersecurite"',
    '"cybersécurité"',
    '"cyber%20security"',
    '"securite"',
    '"sécurité"',
    '"reseaux"',
    '"réseaux"',
    '"soc"',
    '"pentest"',
    '"devsecops"',

    // 📁 IT transverse
    '"engineer"',
    '"ingenieur"',
    '"ingénieur"',
    '"chef%20de%20projet"',
    '"product%20owner"',
    '"product%20manager"',
    '"scrum"',
    '"agile"',
    '"qa"',
    '"IT"',
    '"test',
    '"testeur',
    '"automation"',
    '"automatisation"',
    '"systeme%20informatique"',
    '"system%20administrator"',
    '"administrateur%20systeme"',
];
let currentKeywordIndex = 0;

// Map pour stocker les offres en quarantaine (url -> timestamp)
const SEEN_JOBS_QUARANTINE = new Map();

function cleanQuarantine() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    for (const [url, timestamp] of SEEN_JOBS_QUARANTINE.entries()) {
        if (now - timestamp > TWENTY_FOUR_HOURS) {
            SEEN_JOBS_QUARANTINE.delete(url);
        }
    }
}

/**
 * Fonction principale pour récupérer les offres via Puppeteer
 * @param {number} maxHours Temps maximum en heures pour chercher (1 par défaut)
 * @param {string|null} overrideKeyword Mot-clé spécifique pour forcer la recherche (manuel)
 */
async function getJobPosts(maxHours = 1, overrideKeyword = null) {
    cleanQuarantine();
    console.log(`Démarrage du scraping LinkedIn (Recherche sur les dernières ${maxHours}h)...`);
    const potentialJobs = [];
    const jobPosts = [];

    let currentKeyword = overrideKeyword;
    if (!currentKeyword) {
        currentKeyword = SEARCH_KEYWORDS[currentKeywordIndex];
        const nextIndex = (currentKeywordIndex + 1) % SEARCH_KEYWORDS.length;
        console.log(`Rotation activée : recherche avec le mot-clé = ${currentKeyword} (Prochain index: ${nextIndex})`);
        currentKeywordIndex = nextIndex;
    } else {
        console.log(`Recherche manuelle avec le mot-clé forcé : ${currentKeyword}`);
    }

    const dynamicUrl = `https://www.linkedin.com/jobs/search/?keywords=("alternance"%20OR%20"alternant")%20AND%20${currentKeyword}&geoId=104246759&sortBy=DD&f_TPR=r86400`;

    let browser;
    try {
        if (process.env.BROWSERLESS_TOKEN) {
            console.log("Connexion à Browserless...");
            browser = await puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
            });
        } else {
            // Configuration optimisée pour les serveurs Linux limités (KataBump, Docker)
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
        }

        const page = await browser.newPage();

        // Bloquer le chargement des images/css pour économiser la RAM sur le serveur
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(dynamicUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll pour charger les jobs dynamiques
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Attendre un peu que le contenu s'affiche
        await new Promise(r => setTimeout(r, 3000));

        const content = await page.content();
        const $ = cheerio.load(content);

        const cards = $('.base-card');
        console.log(`${cards.length} offres potentielles trouvées.`);

        cards.each((i, element) => {
            const linkElement = $(element).find('a.base-card__full-link');
            const titleElement = $(element).find('h3.base-search-card__title');

            // Le nom de la boîte peut être dans une des deux classes
            let companyElement = $(element).find('h4.base-search-card__subtitle');
            if (companyElement.length === 0) {
                companyElement = $(element).find('a.hidden-nested-link');
            }

            // La date peut aussi avoir une nouvelle classe rouge quand l'offre est très récente
            let timeElement = $(element).find('time.job-search-card__listdate--new');
            if (timeElement.length === 0) {
                timeElement = $(element).find('time.job-search-card__listdate');
            }

            if (linkElement.length > 0 && titleElement.length > 0 && timeElement.length > 0) {
                const rawUrl = linkElement.attr('href') || "";
                const jobUrl = rawUrl.split('?')[0]; // Nettoyer l'URL
                const jobTitle = titleElement.text().trim();
                const timeText = timeElement.text().trim().toLowerCase();
                const companyName = companyElement.length > 0 ? companyElement.text().trim() : "Entreprise inconnue";

                const jobTitleLower = jobTitle.toLowerCase();

                // Conditions 1: C'est une alternance/apprentissage (vérification stricte dans le titre)
                const isAlternance = jobTitleLower.includes('alternant') ||
                    jobTitleLower.includes('alternance') ||
                    jobTitleLower.includes('apprenti') ||
                    jobTitleLower.includes('apprentissage') ||
                    jobTitleLower.includes('apprentice') ||
                    jobTitleLower.includes('apprenticeships') ||
                    jobTitleLower.includes('apprenticeship');

                // Condition 2: Ne contient pas de mots exclus
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(word => jobTitleLower.includes(word));

                if (isAlternance && !hasExcludeKeyword) {
                    if (SEEN_JOBS_QUARANTINE.has(jobUrl)) {
                        console.log(`[- REFUSÉ QUARANTAINE] "${jobTitle}" a déjà été détectée récemment dans la rotation.`);
                        return; // return équivaut à un 'continue' dans un .each() Cheerio
                    }

                    let isRecent = false;
                    let matchedTimeCondition = "Aucune"; // Pour le debug

                    // Parseur du texte de temps (Gère Français et Anglais)
                    if (timeText.includes('minute') || timeText.includes('seconde') || timeText.includes('second')) {
                        isRecent = true; // Toujours récent car < 1h
                        matchedTimeCondition = "< 1h (minutes/secondes)";
                    } else if (timeText.includes('heure') || timeText.includes('hour')) {
                        const matches = timeText.match(/\d+/);
                        if (matches && matches.length > 0) {
                            const hours = parseInt(matches[0], 10);
                            if (hours <= maxHours) {
                                isRecent = true;
                                matchedTimeCondition = `<= ${maxHours}h`;
                            }
                        }
                    } else if (timeText.includes('jour') || timeText.includes('day')) {
                        const matches = timeText.match(/\d+/);
                        if (matches && matches.length > 0) {
                            const days = parseInt(matches[0], 10);
                            const hours = days * 24;
                            if (hours <= maxHours) {
                                isRecent = true;
                                matchedTimeCondition = `<= ${maxHours}h (jours)`;
                            }
                        }
                    } else if ((timeText.includes('semaine') || timeText.includes('week')) && maxHours >= 168) { // 1 semaine = 168h
                        const matches = timeText.match(/\d+/);
                        if (matches && matches.length > 0) {
                            const weeks = parseInt(matches[0], 10);
                            const hours = weeks * 168;
                            if (hours <= maxHours) {
                                isRecent = true;
                                matchedTimeCondition = `<= ${maxHours}h (semaines)`;
                            }
                        } else {
                            // S'il n'y a pas de chiffre (ex: "1w" ou "Il y a 1 semaine")
                            isRecent = true;
                            matchedTimeCondition = `<= ${maxHours}h (1 semaine texte)`;
                        }
                    }

                    if (isRecent) {
                        potentialJobs.push({ title: jobTitle, company: companyName, url: jobUrl });
                        SEEN_JOBS_QUARANTINE.set(jobUrl, Date.now()); // On l'enregistre dans la quarantaine en mémoire
                        console.log(`[+ AJOUTÉ] "${jobTitle}" (${timeText}) - Condition temps: ${matchedTimeCondition}`);
                    } else {
                        console.log(`[- REFUSÉ TEMPS] "${jobTitle}" (${timeText}) dépasse la limite de ${maxHours}h.`);
                    }
                } else if (isAlternance && hasExcludeKeyword) {
                    const foundWord = EXCLUDE_KEYWORDS.find(word => jobTitleLower.includes(word));
                    console.log(`[- REFUSÉ MOT EXCLU] "${jobTitle}" contient le mot banni: "${foundWord}".`);
                } else if (!isAlternance) {
                    console.log(`[- REFUSÉ TITRE] "${jobTitle}" n'est pas une alternance/apprentissage.`);
                }
            }
        });

    } catch (error) {
        console.error("Erreur durant le scraping :", error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    // On limite à 40 offres max pour ne pas exploser les quotas Groq gratuits ou prendre trop de temps.
    if (potentialJobs.length > 40) {
        console.log(`Trop d'offres (${potentialJobs.length}). Limitation aux 40 plus récentes.`);
        potentialJobs.length = 40;
    }

    console.log(`${potentialJobs.length} offres retenues pour analyse par Groq.`);

    if (!groq) {
        console.warn("Clé GROQ_API_KEY manquante, renvoi des offres sans filtrage IT.");
        for (const job of potentialJobs) {
            jobPosts.push({
                embed: new EmbedBuilder()
                    .setColor(0x0A66C2)
                    .setTitle(job.title)
                    .setURL(job.url)
                    .setDescription(`🏢 **Entreprise** : ${job.company}`),
                channels: [CHANNEL_ID]
            });
        }
        return jobPosts;
    }

    for (const job of potentialJobs) {
        try {
            const prompt = `Tu es un recruteur IT expert. Analyse cette offre d'alternance à partir de son titre et de l'entreprise.
Titre: "${job.title}"
Entreprise: "${job.company}"

Détermine si cette offre correspond aux critères stricts suivants :
1. C'est une offre purement informatique (IT).
2. Le niveau ciblé est Master, Bac+4, Bac+5, ou École d'ingénieurs (ou n'est pas précisé mais semble être du niveau Ingénieur/Cadre). Les offres explicitement destinées aux Bac+2, Bac+3, BTS ou DUT doivent être rejetées.

Si elle répond aux critères, extrais :
- La durée du contrat si elle est explicitement mentionnée dans le titre (ex: "12 mois", "2 ans"). Sinon, écris "Non précisée".
- La ou les filières applicables parmi cette liste stricte : ["LSI", "RS", "BDML", "Transverse"]. 
  (LSI = Logiciel/Dev/SI, RS = Réseaux/Sécurité/Infra/Cloud, BDML = Data/IA/Machine Learning, Transverse = Chef de projet/Business Analyst/Agile).
- L'effectif estimé de l'entreprise (ex: "1-50", "200-500", "1000+", "Inconnu") basé uniquement sur ta connaissance du nom de l'entreprise.
- Le secteur d'activité de l'entreprise (ex: "Défense", "Luxe", "Banque", "ESN", "Inconnu") basé sur ta connaissance de l'entreprise.
- Un court paragraphe (2-3 phrases max, ~250 caractères) en français décrivant les missions typiques du poste et les outils/technologies probables, basé sur le titre. Ex: "Développement et maintenance d'APIs REST en Java/Spring Boot. Participation à la mise en place des pipelines CI/CD avec Jenkins et Docker."

Réponds UNIQUEMENT par un objet JSON valide, sans bloc de code (pas de \`\`\`json) et sans aucun texte avant ou après.
Format attendu:
{
  "valide": true ou false,
  "duree": "Texte extrait ou 'Non précisée'",
  "filieres": ["LSI", "RS"] ou [],
  "effectif": "estimation ou 'Inconnu'",
  "secteur": "Secteur ou 'Inconnu'",
  "mission": "Description brève des tâches"
}`;

            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
                temperature: 0.1,
                response_format: { type: "json_object" }
            });
            let responseText = completion.choices[0]?.message?.content?.trim() || "{}";

            // Nettoyage au cas où l'IA ajoute quand même des balises Markdown
            if (responseText.startsWith('\`\`\`json')) {
                responseText = responseText.replace('\`\`\`json', '').replace('\`\`\`', '').trim();
            } else if (responseText.startsWith('\`\`\`')) {
                responseText = responseText.replace('\`\`\`', '').replace('\`\`\`', '').trim();
            }

            try {
                const parsedResult = JSON.parse(responseText);

                if (parsedResult.valide === true) {
                    const filieresStr = parsedResult.filieres && parsedResult.filieres.length > 0
                        ? parsedResult.filieres.join(', ')
                        : "Non précisée";

                    const embed = new EmbedBuilder()
                        .setColor(0x0A66C2)
                        .setTitle(job.title)
                        .setURL(job.url)
                        .setDescription(`🏢 **Entreprise** : ${job.company} _(Effectif: ${parsedResult.effectif || "Inconnu"} — Secteur: ${parsedResult.secteur || "Inconnu"})_\n⏳ **Durée** : ${parsedResult.duree || "Non précisée"}\n🎓 **Filière(s)** : ${filieresStr}\n\n📋 **Mission**\n${parsedResult.mission || "Non précisée"}`);

                    // Déterminer les channels cibles
                    const targetChannels = new Set([CHANNEL_ID]); // Toujours envoyer sur le channel principal
                    if (parsedResult.filieres && Array.isArray(parsedResult.filieres)) {
                        for (const filiere of parsedResult.filieres) {
                            if (CHANNELS[filiere]) {
                                targetChannels.add(CHANNELS[filiere]);
                            }
                        }
                    }

                    jobPosts.push({
                        embed,
                        channels: Array.from(targetChannels)
                    });
                    console.log(`[🤖 GROQ OK] ${job.title} -> ${filieresStr} (${parsedResult.duree}) | Mission: "${parsedResult.mission}"`);
                } else {
                    console.log(`[🤖 GROQ REJET] ${job.title} chez ${job.company} (Non IT ou niveau trop bas)`);
                }
            } catch (e) {
                console.error("Erreur de parsing JSON depuis Groq:", responseText);
            }

            // Pause de 2 secondes pour respecter la limite de l'API gratuite Groq (30 Req/Min)
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error("Erreur avec l'API Groq pour l'offre:", job.title, error.message);
            // Par défaut, en cas d'erreur de l'API, on transmet l'offre pour ne rien rater dans le channel principal
            jobPosts.push({
                embed: new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setTitle(job.title)
                    .setURL(job.url)
                    .setDescription(`🏢 **Entreprise** : ${job.company}\n⏳ **Durée** : Non précisée _(Erreur IA)_\n🎓 **Filière(s)** : Inconnue`),
                channels: [CHANNEL_ID]
            });

            // Si c'est une erreur de quota (429), on attend encore plus longtemps avant la prochaine requête
            if (error.message && error.message.includes("429")) {
                console.log("Limite de l'API atteinte, pause de 30 secondes...");
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    return jobPosts;
}

/**
 * Fonction pour analyser un lien individuel (Commande /match)
 */
async function analyzeSingleUrl(url) {
    if (!url.includes("linkedin.com/jobs/view/")) {
        return { text: "❌ ERREUR : Le lien doit être une offre LinkedIn (linkedin.com/jobs/view/... )" };
    }

    let browser;
    try {
        if (process.env.BROWSERLESS_TOKEN) {
            browser = await puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
            });
        } else {
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }

        const page = await browser.newPage();

        // Bloquer les ressources inutiles
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const content = await page.content();
        const $ = cheerio.load(content);

        // Sur la page de l'offre (Public View)
        let jobTitle = $('h1.top-card-layout__title').text().trim();
        let companyName = $('a.topcard__org-name-link').text().trim();

        // Scraper la description du poste
        let jobDescription = $('div.show-more-less-html__markup').text().trim();
        if (!jobDescription) {
            jobDescription = $('div.description__text').text().trim();
        }
        // Limiter à 1500 caractères pour ne pas dépasser les limites de l'API
        if (jobDescription.length > 1500) {
            jobDescription = jobDescription.substring(0, 1500) + '...';
        }

        if (!jobTitle) {
            return { text: "❌ Impossible d'extraire le titre de l'annonce. LinkedIn a peut-être bloqué l'accès public ou le lien est invalide." };
        }
        if (!companyName) {
            companyName = "Entreprise inconnue";
        }

        const jobTitleLower = jobTitle.toLowerCase();

        // Conditions : C'est une alternance et ne contient pas de mots exclus
        const isAlternance = jobTitleLower.includes('alternant') ||
            jobTitleLower.includes('alternance') ||
            jobTitleLower.includes('apprenti') ||
            jobTitleLower.includes('apprentissage') ||
            jobTitleLower.includes('apprentice') ||
            jobTitleLower.includes('apprenticeships') ||
            jobTitleLower.includes('apprenticeship');

        const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(word => jobTitleLower.includes(word));

        if (!isAlternance) {
            return { text: `❌ **OFFRE REJETÉE (Filtre basique)**\n**Titre :** ${jobTitle}\n**Raison :** Le titre ne contient pas de mots-clés d'alternance (ex: alternant, apprentissage, etc).` };
        }

        if (hasExcludeKeyword) {
            const foundWord = EXCLUDE_KEYWORDS.find(word => jobTitleLower.includes(word));
            return { text: `❌ **OFFRE REJETÉE (Filtre basique)**\n**Titre :** ${jobTitle}\n**Raison :** Le titre contient le mot-clé banni : "${foundWord}".` };
        }

        if (!groq) {
            return { text: `Titre: **${jobTitle}**\nEntreprise: **${companyName}**\n*(L'analyse Groq est désactivée car aucune clé API n'est fournie)*` };
        }

        const prompt = `Tu es un recruteur IT expert. Analyse cette offre d'alternance à partir de son titre, de l'entreprise et de la description.
Titre: "${jobTitle}"
Entreprise: "${companyName}"
Description: "${jobDescription || 'Non disponible'}"

Détermine si cette offre correspond aux critères stricts suivants :
1. C'est une offre purement informatique (IT).
2. Le niveau ciblé est Master, Bac+4, Bac+5, ou École d'ingénieurs (ou n'est pas précisé mais semble être du niveau Ingénieur/Cadre). Les offres explicitement destinées aux Bac+2, Bac+3, BTS ou DUT doivent être rejetées.

Si elle répond aux critères, extrais :
- La durée du contrat si elle est explicitement mentionnée dans le titre ou la description (ex: "12 mois", "2 ans"). Sinon, écris "Non précisée".
- La ou les filières applicables parmi cette liste stricte : ["LSI", "RS", "BDML", "Transverse"]. 
  (LSI = Logiciel/Dev/SI, RS = Réseaux/Sécurité/Infra/Cloud, BDML = Data/IA/Machine Learning, Transverse = Chef de projet/Business Analyst/Agile).
- L'effectif estimé de l'entreprise (ex: "1-50", "200-500", "1000+", "Inconnu") basé uniquement sur ta connaissance du nom de l'entreprise.
- Le secteur d'activité de l'entreprise (ex: "Défense", "Luxe", "Banque", "ESN", "Inconnu") basé sur ta connaissance de l'entreprise.
- Un court paragraphe (2-3 phrases max, ~250 caractères) en français décrivant les missions et outils/technologies du poste, basé sur la description réelle. Ex: "Analyse des données métiers avec Python et SQL. Création de dashboards Power BI et présentation des insights aux équipes."

Réponds UNIQUEMENT par un objet JSON valide, sans bloc de code (pas de \`\`\`json) et sans aucun texte avant ou après.
Format attendu:
{
  "valide": true ou false,
  "duree": "Texte extrait ou 'Non précisée'",
  "filieres": ["LSI", "RS"] ou [],
  "effectif": "estimation ou 'Inconnu'",
  "secteur": "Secteur ou 'Inconnu'",
  "mission": "Description brève des tâches"
}`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });
        let responseText = completion.choices[0]?.message?.content?.trim() || "{}";

        // Nettoyage Markdown
        if (responseText.startsWith('\`\`\`json')) {
            responseText = responseText.replace('\`\`\`json', '').replace('\`\`\`', '').trim();
        } else if (responseText.startsWith('\`\`\`')) {
            responseText = responseText.replace('\`\`\`', '').replace('\`\`\`', '').trim();
        }

        try {
            const parsedResult = JSON.parse(responseText);

            if (parsedResult.valide === true) {
                const filieresStr = parsedResult.filieres && parsedResult.filieres.length > 0
                    ? parsedResult.filieres.join(', ')
                    : "Non précisée";

                return {
                    embed: new EmbedBuilder()
                        .setColor(0x0A66C2)
                        .setTitle(jobTitle)
                        .setURL(url)
                        .setDescription(`🏢 **Entreprise** : ${companyName} _(Effectif: ${parsedResult.effectif || "Inconnu"} — Secteur: ${parsedResult.secteur || "Inconnu"})_\n⏳ **Durée** : ${parsedResult.duree || "Non précisée"}\n🎓 **Filière(s)** : ${filieresStr}\n\n📋 **Mission**\n${parsedResult.mission || "Non précisée"}`)
                };
            } else {
                return { text: `❌ **OFFRE REJETÉE PAR LE BOT**\n**Titre :** ${jobTitle}\n**Raison :** L'intelligence artificielle a jugé que cette offre n'était pas de l'informatique ou n'avait pas le niveau Master requis.` };
            }

        } catch (e) {
            return { text: `⚠️ **Erreur JSON Groq :** Le robot a lu "${jobTitle}" / "${companyName}" mais n'a pas pu formatter la réponse de l'IA.\nRéponse brute : ${responseText}` };
        }

    } catch (error) {
        console.error("Erreur de scraping pour /match :", error);
        return { text: "❌ Une erreur s'est produite lors de la connexion à LinkedIn (Bot bloqué ou URL invalide)." };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Fonction pour envoyer les jobs récupérés sur Discord
 */
async function sendJobPosts() {
    try {
        const mainChannel = await client.channels.fetch(CHANNEL_ID);
        if (!mainChannel) {
            console.error("Impossible de trouver le salon Discord principal avec l'ID:", CHANNEL_ID);
            return;
        }

        const jobPosts = await getJobPosts(24); // Cron task : last 24h to cover rotation

        if (jobPosts.length === 0) {
            console.log("Aucune annonce de job correspondant n'a été trouvée pour les dernières 24h (Filtre IT appliqué).");
            return;
        }

        for (const post of jobPosts) {
            for (const targetChannelId of post.channels) {
                try {
                    const channel = await client.channels.fetch(targetChannelId);
                    if (channel) {
                        await channel.send({ embeds: [post.embed] });
                    }
                } catch (err) {
                    console.error(`Erreur lors de l'envoi au salon ${targetChannelId}:`, err);
                }
            }
        }
    } catch (error) {
        console.error("Erreur lors de l'envoi sur Discord:", error);
    }
}

client.once('clientReady', async () => {
    console.log(`Le bot ${client.user.tag} est bien connecté !`);

    // --- Enregistrement de la commande Slash ---
    const commands = [
        new SlashCommandBuilder()
            .setName('match')
            .setDescription('Analyse une URL LinkedIn spécifique avec l\'IA du bot')
            .addStringOption(option =>
                option.setName('lien')
                    .setDescription('L\'URL de l\'offre public LinkedIn')
                    .setRequired(true)
            )
            .toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Enregistrement de la commande /match (Application globale/Guild)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Commande /match enregistrée avec succès.');
    } catch (error) {
        console.error("Erreur lors de l'enregistrement de la commande :", error);
    }
    // --- Fin de l'enregistrement ---

    // Lancer une première vérification tout de suite
    console.log("Exécution immédiate au démarrage...");
    await sendJobPosts();

    // Calcul de l'intervalle : On veut 1 passage complet de la liste par jour (24h)
    // Nombre total d'appels par jour = nombre de mots-clés
    const runsPerDay = SEARCH_KEYWORDS.length;
    const intervalMs = Math.round((24 * 60 * 60 * 1000) / runsPerDay);
    const intervalMinutes = (intervalMs / 60000).toFixed(1);

    console.log(`Planificateur dynamique activé : ${SEARCH_KEYWORDS.length} mots-clés détectés.`);
    console.log(`Fréquence : 1 rotation par jour -> Lancement toutes les ${intervalMinutes} minutes.`);

    setInterval(async () => {
        console.log(`Lancement de l'actualisation planifiée (${new Date().toLocaleString()})`);
        await sendJobPosts();
    }, intervalMs);
});

client.on('error', (error) => {
    console.error('Erreur client Discord:', error);
});

// Écoute des commandes Slash
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'match') {
        const urlGiven = interaction.options.getString('lien');
        await interaction.deferReply(); // Laisse le temps au scraping

        try {
            const result = await analyzeSingleUrl(urlGiven);
            if (result.embed) {
                await interaction.editReply({ embeds: [result.embed] });
            } else {
                await interaction.editReply(result.text);
            }
        } catch (error) {
            console.error("Erreur slash command /match:", error);
            await interaction.editReply("Une erreur s'est produite lors de l'exécution de la commande.");
        }
    }
});

// Connexion à Discord
if (!TOKEN) {
    console.error("ERREUR FATALE: Le DISCORD_TOKEN n'est pas défini dans le fichier .env");
    process.exit(1);
}
client.login(TOKEN);
