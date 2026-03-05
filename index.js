require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, Events, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const cron = require('cron');
const Groq = require('groq-sdk');

// Configuration du client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Variables de suivi pour /status
const botStartTime = Date.now();
let lastCronExecution = null;

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// IDs des channels spécifiques par filière
const CHANNELS = {
    "LSI": "1478276479455592480",
    "RS": "1478276498749259867",
    "BDML": "1478276570559807579",
    "Transverse": "1478276858956091534"
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
    'pharmacométrie', 'acheteur', 'chimie', 'magasinier', 'achat', 'cuisinier', 'styliste',
    'formateur', 'enseignant', 'professeur', 'campus', 'ecole', 'école', 'academy', 'training'
];

// Rotation des mots clés de recherche dynamiques
const SEARCH_KEYWORDS = [
    // 🖥️ ESN / Conseil IT / Tech
    '"Capgemini"',
    '"Accenture"',
    '"Sopra%20Steria"',
    '"Devoteam"',
    '"Altran"',
    '"Atos"',
    '"IBM"',
    '"Tata%20Consultancy%20Services"',
    '"Microsoft"',
    '"Oracle"',
    '"SAP"',
    '"Salesforce"',
    '"Palantir"',
    '"CGI"',
    '"Inetum"',
    '"Aubay"',

    // 🏦 Banque / Assurance / Finance
    '"BNP%20Paribas"',
    '"Société%20Générale"',
    '"Crédit%20Agricole"',
    '"LCL"',
    '"Natixis"',
    '"BPCE"',
    '"La%20Banque%20Postale"',
    '"AXA"',
    '"Groupama"',
    '"Allianz"',
    '"Generali"',
    '"Boursorama"',
    '"Covéa"',

    // 🛡️ Défense / Aérospatial
    '"Airbus"',
    '"Dassault%20Aviation"',
    '"Dassault%20Systems"',
    '"Thales"',
    '"Safran"',
    '"MBDA"',

    // ⚡ Énergie / Industrie
    '"TotalEnergies"',
    '"EDF"',
    '"Enedis"',
    '"Réseau%20de%20Transport%20d%27Électricité"',
    '"RTE"',
    '"ENGIE"',
    '"SUEZ"',
    '"Veolia"',
    '"Schneider%20Electric"',
    '"Stellantis"',
    '"Valeo"',
    '"Vallourec"',
    '"Renault"',

    // 📡 Télécoms
    '"Orange"',
    '"SFR"',
    '"Bouygues%20Telecom"',
    '"Free"',

    // 🚄 Transport / Logistique / Services publics
    '"SNCF"',
    '"La%20Poste"',
    '"Docaposte"',
    '"RATP"',

    // 💎 Luxe / Cosmétique
    '"LVMH"',
    '"Hermès"',
    '"Chanel"',
    '"Dior"',
    '"Louis%20Vuitton"',
    '"Cartier"',
    '"Richemont"',
    '"Bulgari"',
    '"Givenchy"',
    '"Balenciaga"',
    '"Saint Laurent"',
    '"Guerlain"',
    '"Sephora"',
    '"L%27Oréal"',

    // 🛒 Grande Conso / Distribution
    '"Danone"',
    '"Nestlé"',
    '"Groupe%20Casino"',
    '"Veepee"',

    // 🏗️ BTP / Construction
    '"Vinci"',
    '"Bouygues%20Construction"',
    '"Eiffage"',

    // 🚀 Tech / Startup
    '"Doctolib"',
    '"Datadog"',

    // 💊 Santé
    '"Sanofi"',
    '"GE%20Healthcare"',

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
    '"securite"',
    '"sécurité"',
    '"reseaux"',
    '"réseaux"',
    '"soc"',
    '"pentest"',
    '"devsecops"',

    // 📁 IT transverse
    '"SI"',
    '"IT"',
    '"engineer"',
    '"ingenieur"',
    '"ingénieur"',
    '"chef%20de%20projet"',
    '"product%20owner"',
    '"product%20manager"',
    '"scrum"',
    '"business"',
    '"analyst"',
    '"agile"',
    '"test"',
    '"testeur"',
    '"automation"',
    '"systeme"',
    '"support"',
    '"administrator"',
    '"administrateur"',
    '"consultant"',
    '"chargé"',

    // 📊 Data / IA
    '"data%20analyst"',
    '"data%20engineer"',
    '"data%20scientist"',
    '"machine%20learning"',
    '"deep%20learning"',
    '"big%20data"',
    '"business%20analyst"',
    '"python"',
    '"sql"',
    '"IA"',

    // 💻 Développement
    '"concepteur"',
    '"développeur"',
    '"software%20engineer"',
    '"fullstack"',
    '"backend"',
    '"frontend"',
    '"java"',
    '"spring"',
    '"c%23"',
    '".net"',
    '"javascript"',
    '"react"',
    '"angular"',
    '"vue"',
    '"php"',
    '"api"',
    '"microservices"'
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

    const dynamicUrl = `https://www.linkedin.com/jobs/search/?keywords=("alternance"%20OR%20"alternant"%20OR%20"apprenti")%20AND%20${currentKeyword}&geoId=104246759&sortBy=DD&f_TPR=r86400`;

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
3. L'employeur doit être une ENTREPRISE (poste professionnel). Rejette systématiquement les offres provenant d'écoles, centres de formation, organismes de formation, universités, académies ou tout établissement d'enseignement. On veut uniquement des postes en entreprise, pas des écoles qui recrutent des alternants.

Si elle répond aux critères, extrais :
- La durée du contrat si elle est explicitement mentionnée dans le titre (ex: "12 mois", "2 ans"). Sinon, écris "Non précisée".
- La ou les filières applicables parmi cette liste stricte : ["LSI", "RS", "BDML", "Transverse"].
  Voici la définition précise de chaque filière avec des exemples de métiers :
  * LSI (Logiciel et Systèmes d'Information) : Développeur(se) full-stack / logiciel / mobile, Ingénieur(e) en systèmes d'information, Architecte logiciel ou cloud, Consultant(e) IT / SI / transformation digitale, DevOps Engineer / Ingénieur(e) intégration et déploiement.
  * BDML (Big Data et Machine Learning) : Data Scientist, Machine Learning Engineer, Computer Vision Engineer, Data Engineer, Big Data Architect, Data Analyst, Prompt Engineer.
  * RS (Réseaux et Sécurité) : Expert en administration des réseaux, Expert en sécurité des infrastructures / communication / stockage, Architecte réseaux / sécurité, Ingénieur conseil en réseaux / sécurité, Administrateur systèmes et réseaux.
  * Transverse : Métiers orientés ingénierie non technique pure comme Business Analyst, Chef(fe) de projet informatique, Scrum Master, Product Owner, Consultant(e) Agile, MOA.
- L'effectif estimé de l'entreprise parmi ces tranches : "1-50", "51-200", "201-1 000", "1 001-5 000", "5 001-20 000", "20 001-50 000", "50 000+" ou "Inconnu". Base-toi uniquement sur ta connaissance du nom de l'entreprise. Sois précis (ex: Capgemini = "50 000+", Doctolib = "1 001-5 000").
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
 * Supporte LinkedIn ET les sites externes (WTTJ, Indeed, HelloWork, etc.)
 */
async function analyzeSingleUrl(url) {
    // Vérifier que c'est au moins une URL valide
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { text: "❌ ERREUR : Le lien doit être une URL valide (commençant par http:// ou https://)" };
    }

    const isLinkedIn = url.includes("linkedin.com");

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

        // User-Agent réaliste pour éviter les blocages sur certains sites
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

        // Attendre un peu que le contenu dynamique se charge
        await new Promise(r => setTimeout(r, 2000));

        const content = await page.content();
        const $ = cheerio.load(content);

        let jobTitle = '';
        let companyName = '';
        let jobDescription = '';

        if (isLinkedIn) {
            // === Sélecteurs LinkedIn ===
            jobTitle = $('h1.top-card-layout__title').text().trim();
            companyName = $('a.topcard__org-name-link').text().trim();
            jobDescription = $('div.show-more-less-html__markup').text().trim();
            if (!jobDescription) {
                jobDescription = $('div.description__text').text().trim();
            }
        } else {
            // === Scraping générique pour tout site (job boards + sites carrières d'entreprise) ===

            // Titre : sélecteurs spécifiques aux ATS + fallbacks génériques
            const titleSelectors = [
                'h1.job-title', 'h1.posting-headline',             // Lever, Greenhouse
                'h1[data-automation-id="jobPostingHeader"]',        // Workday
                '.job-title h1', '.requisitionTitle',               // Taleo
                'h1.job-header', 'h1.offer-title',                  // SmartRecruiters, divers
                '[data-testid="job-title"]',                        // WTTJ
                'h1'                                                 // Fallback générique
            ];
            for (const selector of titleSelectors) {
                const found = $(selector).first().text().trim();
                if (found && found.length > 3 && found.length < 200) {
                    jobTitle = found;
                    break;
                }
            }
            if (!jobTitle) {
                jobTitle = $('meta[property="og:title"]').attr('content')?.trim() || '';
            }
            if (!jobTitle) {
                jobTitle = $('title').text().trim();
            }

            // Entreprise : meta tags + sélecteurs courants + extraction du domaine en fallback
            companyName = $('meta[property="og:site_name"]').attr('content')?.trim() || '';
            if (!companyName || companyName.length > 50) {
                const companySelectors = [
                    '[data-testid="company-name"]',                     // WTTJ
                    '.company-name', '.employer-name',                  // Générique
                    'a[data-tn-element="companyName"]',                 // Indeed
                    '.job-company-name',                                // HelloWork
                    '[itemprop="hiringOrganization"] [itemprop="name"]', // Schema.org
                    '[data-automation-id="company"]',                    // Workday
                    '.company', '.CompanyName', '.brand'
                ];
                for (const selector of companySelectors) {
                    const found = $(selector).first().text().trim();
                    if (found && found.length < 80) {
                        companyName = found;
                        break;
                    }
                }
            }
            // Dernier fallback : extraire le nom du domaine (capgemini.com -> Capgemini)
            if (!companyName) {
                try {
                    const hostname = new URL(url).hostname.replace('www.', '').split('.')[0];
                    companyName = hostname.charAt(0).toUpperCase() + hostname.slice(1);
                } catch (e) { /* ignore */ }
            }

            // Description : sélecteurs ATS + job boards + fallbacks
            const descSelectors = [
                '[data-testid="job-section-description"]',              // WTTJ
                '[data-automation-id="jobPostingDescription"]',          // Workday
                '.job-description', '.jobsearch-jobDescriptionText',    // Indeed
                '#job-description', '.description__text',
                '.requisitionDescription', '.job-posting-section',       // Taleo
                '[itemprop="description"]',                              // Schema.org
                '.offer-description', '.job-desc',
                'article', 'main', '.content'
            ];
            for (const selector of descSelectors) {
                const found = $(selector).first().text().trim();
                if (found && found.length > 50) {
                    jobDescription = found;
                    break;
                }
            }
            // Fallback : tout le texte du body
            if (!jobDescription) {
                jobDescription = $('body').text().replace(/\s+/g, ' ').trim();
            }
        }

        // Limiter à 1500 caractères pour ne pas dépasser les limites de l'API
        if (jobDescription.length > 1500) {
            jobDescription = jobDescription.substring(0, 1500) + '...';
        }

        if (!jobTitle) {
            return { text: "❌ Impossible d'extraire le titre de l'annonce. Le site a peut-être bloqué l'accès ou le lien est invalide." };
        }
        if (!companyName) {
            companyName = "Entreprise inconnue";
        }

        const jobTitleLower = jobTitle.toLowerCase();
        const fullTextLower = (jobTitle + ' ' + jobDescription).toLowerCase();

        // Vérifier alternance dans le titre OU dans la description (sites d'entreprise ne mettent pas toujours "alternant" dans le titre)
        const isAlternanceInTitle = jobTitleLower.includes('alternant') ||
            jobTitleLower.includes('alternance') ||
            jobTitleLower.includes('apprenti') ||
            jobTitleLower.includes('apprentissage') ||
            jobTitleLower.includes('apprentice') ||
            jobTitleLower.includes('apprenticeships') ||
            jobTitleLower.includes('apprenticeship');

        const isAlternanceInDescription = fullTextLower.includes('alternant') ||
            fullTextLower.includes('alternance') ||
            fullTextLower.includes('apprenti') ||
            fullTextLower.includes('apprentissage') ||
            fullTextLower.includes('contrat de professionnalisation');

        const isAlternance = isAlternanceInTitle || isAlternanceInDescription;

        const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(word => jobTitleLower.includes(word));

        if (!isAlternance) {
            return { text: `❌ **OFFRE REJETÉE (Filtre basique)**\n**Titre :** ${jobTitle}\n**Raison :** Aucun mot-clé d'alternance trouvé dans le titre ni dans la description.` };
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
3. L'employeur doit être une ENTREPRISE (poste professionnel). Rejette systématiquement les offres provenant d'écoles, centres de formation, organismes de formation, universités, académies ou tout établissement d'enseignement. On veut uniquement des postes en entreprise, pas des écoles qui recrutent des alternants.

Si elle répond aux critères, extrais :
- La durée du contrat si elle est explicitement mentionnée dans le titre ou la description (ex: "12 mois", "2 ans"). Sinon, écris "Non précisée".
- La ou les filières applicables parmi cette liste stricte : ["LSI", "RS", "BDML", "Transverse"].
  Voici la définition précise de chaque filière avec des exemples de métiers :
  * LSI (Logiciel et Systèmes d'Information) : Développeur(se) full-stack / logiciel / mobile, Ingénieur(e) en systèmes d'information, Architecte logiciel ou cloud, Consultant(e) IT / SI / transformation digitale, DevOps Engineer / Ingénieur(e) intégration et déploiement.
  * BDML (Big Data et Machine Learning) : Data Scientist, Machine Learning Engineer, Computer Vision Engineer, Data Engineer, Big Data Architect, Data Analyst, Prompt Engineer.
  * RS (Réseaux et Sécurité) : Expert en administration des réseaux, Expert en sécurité des infrastructures / communication / stockage, Architecte réseaux / sécurité, Ingénieur conseil en réseaux / sécurité, Administrateur systèmes et réseaux.
  * Transverse : Métiers orientés ingénierie non technique pure comme Business Analyst, Chef(fe) de projet informatique, Scrum Master, Product Owner, Consultant(e) Agile, MOA.
- L'effectif estimé de l'entreprise parmi ces tranches : "1-50", "51-200", "201-1 000", "1 001-5 000", "5 001-20 000", "20 001-50 000", "50 000+" ou "Inconnu". Base-toi uniquement sur ta connaissance du nom de l'entreprise. Sois précis (ex: Capgemini = "50 000+", Doctolib = "1 001-5 000").
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
        return { text: "❌ Une erreur s'est produite lors de la connexion au site (accès bloqué ou URL invalide)." };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Fonction pour envoyer les jobs récupérés sur Discord
 */
async function sendJobPosts() {
    lastCronExecution = Date.now();
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
            .setDescription('Analyse une URL d\'offre d\'alternance avec l\'IA du bot')
            .addStringOption(option =>
                option.setName('lien')
                    .setDescription('L\'URL de l\'offre (LinkedIn, WTTJ, Indeed...)')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('search')
            .setDescription('Lance une recherche manuelle d\'alternances IT avec un mot-clé')
            .addStringOption(option =>
                option.setName('mot')
                    .setDescription('Le mot-clé à rechercher (ex: python, cybersécurité, Capgemini)')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Affiche la liste des commandes du bot et comment les utiliser')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Vérifie que le bot est en ligne et affiche sa latence')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Affiche l\'état actuel du bot : uptime, cron, rotation des mots-clés')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('filieres')
            .setDescription('Explique les 4 filières IT du bot avec des exemples de métiers')
            .toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Enregistrement des commandes slash (Application globale)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Commandes slash enregistrées avec succès.');
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

    if (interaction.commandName === 'search') {
        const rawKeyword = interaction.options.getString('mot');
        await interaction.deferReply();

        try {
            // Encadrer automatiquement le mot-clé avec des guillemets encodés pour LinkedIn
            const formattedKeyword = `"${rawKeyword}"`;
            await interaction.editReply(`🔍 Recherche en cours pour **${rawKeyword}**... Cela peut prendre une minute.`);

            const jobPosts = await getJobPosts(24, formattedKeyword);

            if (jobPosts.length === 0) {
                await interaction.editReply(`🔍 Recherche terminée pour **"${rawKeyword}"** : aucune alternance IT trouvée.`);
                return;
            }

            await interaction.editReply(`🔍 Recherche terminée pour **"${rawKeyword}"** : **${jobPosts.length}** offre(s) trouvée(s) !`);

            // Envoyer les résultats dans le channel
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
            console.error("Erreur slash command /search:", error);
            await interaction.editReply("❌ Une erreur s'est produite lors de la recherche.");
        }
    }

    if (interaction.commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📖 Commandes du Bot Alternance IT')
            .setDescription('Voici toutes les commandes disponibles :')
            .addFields(
                {
                    name: '🔍 /search `mot`',
                    value: 'Lance une recherche manuelle d\'alternances IT sur LinkedIn avec un mot-clé.\nLe mot est automatiquement mis entre guillemets pour une recherche exacte.\n**Ex:** `/search python`, `/search Capgemini`'
                },
                {
                    name: '🎯 /match `lien`',
                    value: 'Analyse une URL d\'offre d\'alternance (LinkedIn, WTTJ, Indeed...) avec l\'IA.\nLe bot vérifie si c\'est de l\'IT, le niveau, et extrait les infos clés.\n**Ex:** `/match https://linkedin.com/jobs/view/...`'
                },
                {
                    name: '📊 /status',
                    value: 'Affiche l\'état du bot : uptime, dernière exécution du cron, et la rotation des mots-clés (10 derniers + 10 prochains).'
                },
                {
                    name: '🎓 /filieres',
                    value: 'Explique les 4 filières IT (LSI, BDML, RS, Transverse) avec des exemples de métiers.'
                },
                {
                    name: '🏓 /ping',
                    value: 'Vérifie que le bot est en ligne et affiche sa latence en millisecondes.'
                },
                {
                    name: '📖 /help',
                    value: 'Affiche ce message d\'aide.'
                }
            )
            .setFooter({ text: '🤖 Bot Alternance IT — Recherche automatique toutes les X minutes' })
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed] });
    }

    if (interaction.commandName === 'ping') {
        const latency = Date.now() - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const pingEmbed = new EmbedBuilder()
            .setColor(latency < 200 ? 0x57F287 : latency < 500 ? 0xFEE75C : 0xED4245)
            .setTitle('🏓 Pong !')
            .addFields(
                { name: 'Latence bot', value: `\`${latency}ms\``, inline: true },
                { name: 'Latence API Discord', value: `\`${apiLatency}ms\``, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [pingEmbed] });
    }

    if (interaction.commandName === 'status') {
        // Calcul de l'uptime
        const uptimeMs = Date.now() - botStartTime;
        const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const uptimeStr = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes}min` : `${uptimeMinutes}min`;

        // Dernière exécution du cron
        let lastCronStr = 'Pas encore exécuté';
        if (lastCronExecution) {
            const agoMs = Date.now() - lastCronExecution;
            const agoMinutes = Math.floor(agoMs / (1000 * 60));
            if (agoMinutes < 1) {
                lastCronStr = 'Il y a moins d\'une minute';
            } else if (agoMinutes < 60) {
                lastCronStr = `Il y a ${agoMinutes} min`;
            } else {
                const agoHours = Math.floor(agoMinutes / 60);
                lastCronStr = `Il y a ${agoHours}h ${agoMinutes % 60}min`;
            }
        }

        // Calcul de l'intervalle
        const runsPerDay = SEARCH_KEYWORDS.length;
        const intervalMs = Math.round((24 * 60 * 60 * 1000) / runsPerDay);
        const intervalMinutes = (intervalMs / 60000).toFixed(1);

        // Derniers 10 mots-clés (ceux qui viennent d'être utilisés)
        const totalKw = SEARCH_KEYWORDS.length;
        const last10 = [];
        for (let i = 1; i <= 10; i++) {
            const idx = (currentKeywordIndex - i + totalKw) % totalKw;
            last10.push(SEARCH_KEYWORDS[idx].replace(/%20/g, ' ').replace(/"/g, ''));
        }

        // Prochains 10 mots-clés
        const next10 = [];
        for (let i = 0; i < 10; i++) {
            const idx = (currentKeywordIndex + i) % totalKw;
            next10.push(SEARCH_KEYWORDS[idx].replace(/%20/g, ' ').replace(/"/g, ''));
        }

        const statusEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('📊 État du Bot')
            .addFields(
                { name: '⏱️ Uptime', value: `\`${uptimeStr}\``, inline: true },
                { name: '🔄 Dernière exécution cron', value: `\`${lastCronStr}\``, inline: true },
                { name: '📋 Mots-clés dans la rotation', value: `\`${totalKw}\` mots-clés`, inline: true },
                { name: '⏳ Fréquence', value: `Toutes les \`${intervalMinutes} min\``, inline: true },
                { name: '📍 Index actuel', value: `\`${currentKeywordIndex}\` / ${totalKw}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '⏪ 10 derniers mots-clés utilisés', value: last10.map((kw, i) => `\`${i + 1}.\` ${kw}`).join('\n') },
                { name: '⏩ 10 prochains mots-clés', value: next10.map((kw, i) => `\`${i + 1}.\` ${kw}`).join('\n') }
            )
            .setFooter({ text: '🤖 Bot Alternance IT' })
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
    }

    if (interaction.commandName === 'filieres') {
        const filieresEmbed = new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle('🎓 Les 4 Filières IT')
            .setDescription('Voici les filières utilisées par le bot pour classer les offres d\'alternance :')
            .addFields(
                {
                    name: '💻 LSI — Logiciel et Systèmes d\'Information',
                    value: '\u2022 Développeur(se) full-stack / logiciel / mobile\n\u2022 Ingénieur(e) en systèmes d\'information\n\u2022 Architecte logiciel ou cloud\n\u2022 Consultant(e) IT / SI / transformation digitale\n\u2022 DevOps Engineer / Ingénieur(e) intégration et déploiement'
                },
                {
                    name: '🧠 BDML — Big Data et Machine Learning',
                    value: '\u2022 Data Scientist\n\u2022 Machine Learning Engineer\n\u2022 Computer Vision Engineer\n\u2022 Data Engineer / Big Data Architect\n\u2022 Data Analyst\n\u2022 Prompt Engineer'
                },
                {
                    name: '🔐 RS — Réseaux et Sécurité',
                    value: '\u2022 Expert en administration des réseaux\n\u2022 Expert en sécurité des infrastructures\n\u2022 Architecte réseaux / sécurité\n\u2022 Ingénieur conseil en réseaux / sécurité\n\u2022 Administrateur systèmes et réseaux'
                },
                {
                    name: '🔄 Transverse',
                    value: '\u2022 Business Analyst\n\u2022 Chef(fe) de projet informatique\n\u2022 Scrum Master / Product Owner\n\u2022 Consultant(e) Agile\n\u2022 MOA / MOE'
                }
            )
            .setFooter({ text: '📌 Chaque offre détectée est envoyée dans le channel correspondant à sa filière.' })
            .setTimestamp();

        await interaction.reply({ embeds: [filieresEmbed] });
    }
});

// Connexion à Discord
if (!TOKEN) {
    console.error("ERREUR FATALE: Le DISCORD_TOKEN n'est pas défini dans le fichier .env");
    process.exit(1);
}
client.login(TOKEN);
