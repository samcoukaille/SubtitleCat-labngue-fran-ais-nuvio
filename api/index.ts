import express from 'express';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';

const MANIFEST = {
    id: 'org.subtitlecat.v73',
    version: '1.7.3',
    name: 'SubtitleCat - langue français',
    description: 'Sous-titres en français depuis SubtitleCat.com',
    logo: 'https://cdn-icons-png.flaticon.com/512/3503/3503844.png',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
};

// Correspondance entre les noms de langues de SubtitleCat et les codes Stremio (ISO 639-2/B)
const LANG_MAP: Record<string, string> = {
    'dutch': 'nld',
    'english': 'eng',
    'french': 'fre',
    'german': 'ger',
    'spanish': 'spa',
    'italian': 'ita',
    'portuguese': 'por',
    'russian': 'rus',
    'turkish': 'tur',
    'polish': 'pol',
    'hebrew': 'heb',
    'arabic': 'ara',
    'czech': 'cze',
    'hungarian': 'hun',
    'romanian': 'rum',
    'greek': 'gre',
    'danish': 'dan',
    'swedish': 'swe',
    'norwegian': 'nor',
    'finnish': 'fin',
    'albanian': 'sqi',
    'shqip': 'sqi'
};

function mapLanguage(lang: string): string | null {
    // Supprime les emojis et les caractères non alphabétiques
    const cleanLang = lang.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!cleanLang) return null;
    
    // Vérifie s'il s'agit déjà d'un code à 3 lettres pris en charge
    const values = Object.values(LANG_MAP);
    if (values.includes(cleanLang)) return cleanLang;
    
    return LANG_MAP[cleanLang] || null;
}

async function searchSubtitleCat(query: string, type: string, season?: string, episode?: string, host?: string, imdbId?: string, year?: string) {
    try {
        const stealthHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://subtitlecat.com/'
        };

        let cleanTitle = query.replace(/\s\(\d{4}\)$/, '').trim();
        const searchQueries = [cleanTitle];
        if (imdbId) searchQueries.push(imdbId);
        if (year) searchQueries.push(`${cleanTitle} ${year}`);
        
        if (type === 'series' && season && episode) {
            const s = season.padStart(2, '0');
            const e = episode.padStart(2, '0');
            searchQueries.push(`${cleanTitle} S${s}E${e}`);
        }

        const searchPromises = searchQueries.map(async (q) => {
            const searchUrl = `https://subtitlecat.com/index.php?search=${encodeURIComponent(q)}`;
            const response = await axios.get(searchUrl, {
                headers: stealthHeaders,
                timeout: 6000
            }).catch(() => null);

            if (!response || !response.data) return [];

            const $ = cheerio.load(response.data);
            const localResults: any[] = [];

            $('table.table tr').each((i, el) => {
                if (i === 0) return;
                const link = $(el).find('td:nth-child(1) a');
                const title = link.text().trim();
                const href = link.attr('href');
                const rawLang = $(el).find('td:nth-child(2)').text().trim();
                
                // Vérifie toutes les colonnes pour savoir si le français est disponible
                const rowText = $(el).text().toLowerCase();
                const isFrenchAvailable = rowText.includes('french') || rowText.includes('français') || rowText.includes('francais');

                if (type === 'series' && season && episode) {
                    const s = season.padStart(2, '0');
                    const e = episode.padStart(2, '0');
                    const sNum = parseInt(season);
                    const eNum = parseInt(episode);
                    const pattern1 = new RegExp(`S${s}E${e}`, 'i');
                    const pattern2 = new RegExp(`${season}x${episode}`, 'i');
                    const pattern3 = new RegExp(`${s}x${e}`, 'i');
                    const pattern4 = new RegExp(`S${sNum}E${eNum}`, 'i');
                    
                    if (!pattern1.test(title) && !pattern2.test(title) && !pattern3.test(title) && !pattern4.test(title)) {
                        return;
                    }
                }

                if (href && href.startsWith('subs/')) {
                    const parts = href.split('/');
                    const subId = parts[1];
                    const filename = parts[2].replace('.html', '');
                    
                    const baseUrl = host ? `https://${host}` : '';
                    const frenchProxyUrl = `${baseUrl}/proxy/${subId}/${filename}/french.srt`;
                    const originalProxyUrl = `${baseUrl}/proxy/${subId}/${filename}.srt`;

                    const statusIcon = isFrenchAvailable ? '✅' : '⏳';
                    const statusText = isFrenchAvailable ? 'Direct' : 'Attente 25s';

                    localResults.push({
                        url: frenchProxyUrl,
                        lang: 'fre',
                        id: `${subId}-${filename}-fre`,
                        label: `${statusIcon} SubtitleCat: ${title} (${statusText})`
                    });

                    const mappedLang = mapLanguage(rawLang);
                    if (mappedLang && mappedLang !== 'fre') {
                        localResults.push({
                            url: originalProxyUrl,
                            lang: mappedLang,
                            id: `${subId}-${filename}-orig`,
                            label: `SubtitleCat: ${title} (${rawLang})`
                        });
                    }
                }
            });
            return localResults;
        });

        const resultsArray = await Promise.all(searchPromises);
        const allResults = resultsArray.flat();
        const uniqueResults = Array.from(new Map(allResults.map(item => [item.url, item])).values()).slice(0, 25);
        return uniqueResults;
    } catch (e) {
        console.error('Erreur de recherche SubtitleCat :', e);
        return [];
    }
}

// Récupère le titre à partir de l'identifiant IMDb via Cinemeta
async function getMetadata(type: string, id: string) {
    try {
        const imdbId = id.split(':')[0];
        const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        return response.data.meta;
    } catch (e) {
        console.error('Erreur Cinemeta :', e);
        return null;
    }
}

async function createServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Utilise le middleware cors officiel pour une meilleure compatibilité
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
        allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Stremio-User', 'X-Stremio-App']
    }));

    app.use(express.json());

    // 2. Journalisation
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });

    // 3. Service du manifeste (priorité maximale)
    const serveManifest = (req: any, res: any) => {
        console.log(`[DEBUG] Envoi du manifeste à : ${req.headers['user-agent']}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.json(MANIFEST);
    };

    // Plusieurs chemins pour une compatibilité maximale - DOIT ÊTRE AVANT LES AUTRES ROUTES
    app.get('/manifest.json', serveManifest);
    app.get('/manifest.v2.json', serveManifest);
    app.get('/manifest', serveManifest);
    
    // Prise en charge de la découverte du manifeste à la racine par Stremio
    app.get('/', (req, res, next) => {
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        const accept = (req.headers['accept'] || '').toLowerCase();
        
        // Si c'est Stremio, ou si du JSON est demandé, ou si ce n'est PAS un navigateur, on sert le manifeste
        const isStremio = ua.includes('stremio') || accept.includes('json') || req.query.stremio === 'true';
        const isBrowser = ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari');
        
        if (isStremio || !isBrowser) {
            return serveManifest(req, res);
        }
        // Sinon, c'est un navigateur : on laisse passer vers le frontend
        next();
    });

    // Route des sous-titres - capte toutes les variantes
    app.get('/subtitles/:type/:id/:extra?', async (req, res) => {
        try {
            let { type, id, extra } = req.params;
            
            // Nettoyage des paramètres
            const cleanId = id.replace('.json', '');
            const cleanExtra = (extra || '').replace('.json', '');
            
            // Extrait la langue demandée depuis extra (ex. "language=fre" ou simplement "fre")
            let requestedLang = '';
            if (cleanExtra.includes('language=')) {
                requestedLang = cleanExtra.split('language=')[1].split('&')[0];
            } else if (cleanExtra.length === 3) {
                requestedLang = cleanExtra;
            }
            
            console.log(`[DEBUG] Requête de sous-titres : type=${type}, id=${cleanId}, lang=${requestedLang}`);

            const meta = await getMetadata(type, cleanId);
            if (!meta) {
                return res.json({ subtitles: [] });
            }

            let season, episode;
            if (type === 'series') {
                const parts = cleanId.split(':');
                season = parts[1];
                episode = parts[2];
            }

            const host = req.headers.host;
            const imdbId = cleanId.split(':')[0];
            const year = meta.year || meta.releaseInfo;
            const allSubtitles = await searchSubtitleCat(meta.name, type, season, episode, host, imdbId, year);
            
            // FILTRAGE STRICT : ne renvoie que la langue demandée par Stremio
            // Si aucune langue n'est demandée, le français est utilisé par défaut pour cet addon
            const targetLang = requestedLang || 'fre';
            const filteredSubtitles = allSubtitles.filter(s => s.lang === targetLang);
            
            console.log(`[DEBUG] Renvoi de ${filteredSubtitles.length} sous-titres pour la langue : ${targetLang}`);
            res.json({ subtitles: filteredSubtitles });
        } catch (err) {
            console.error('Erreur de la route des sous-titres :', err);
            res.json({ subtitles: [] });
        }
    });

    // Route proxy pour gérer le CORS et les téléchargements directs - joker utilisé pour plus de robustesse
    app.get('/proxy/:id/*', async (req, res) => {
        const id = req.params.id;
        const remainingPath = req.params[0]; // Récupère le reste de l'URL
        
        // Extrait le nom de fichier et la langue du chemin restant
        // Format : nomfichier/langue.srt ou nomfichier.srt
        const parts = remainingPath.split('/');
        const filename = parts[0];
        const lang = parts.length > 1 ? parts[1] : null;
        const langName = lang ? lang.replace('.srt', '').toLowerCase() : 'english';

        const commonHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="123", "Not:A-Brand";v="8"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'keep-alive'
        };

        const fetchFile = async (url: string, currentCookies: string[] = []) => {
            console.log(`[DEBUG] Étape 3 : tentative de téléchargement final : ${url}`);
            try {
                const res = await axios.get(url, {
                    responseType: 'arraybuffer', // Récupéré en buffer pour un encodage fiable
                    headers: {
                        ...commonHeaders,
                        'Cookie': currentCookies.join('; '),
                        'Referer': `https://subtitlecat.com/subs/${id}`
                    },
                    timeout: 25000,
                    maxRedirects: 5,
                    validateStatus: (status) => status === 200
                });
                
                // Conversion en UTF-8
                const decoder = new TextDecoder('utf-8');
                let srtContent = decoder.decode(res.data);
                
                // 1. Supprime le BOM s'il est présent
                srtContent = srtContent.replace(/^\uFEFF/, '');
                
                // 2. Supprime les balises HTML récupérées par erreur
                srtContent = srtContent.replace(/<[^>]*>/g, '');
                
                // 3. Normalise les fins de ligne en LF
                srtContent = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                const trimmed = srtContent.trim();
                
                // 4. Validation souple : doit contenir un indicateur d'horodatage
                if (!trimmed || trimmed.length < 20 || !trimmed.includes('-->')) {
                    console.error(`[DEBUG] Contenu SRT invalide détecté. Longueur : ${trimmed.length}`);
                    throw new Error("Invalid SRT content received");
                }

                console.log(`[DEBUG] Étape 4 : téléchargement réussi ! Extrait du SRT servi : ${trimmed.substring(0, 100)}`);
                return srtContent;
            } catch (err: any) {
                console.error(`[DEBUG] Étape 4 : échec du téléchargement ! Statut : ${err.response?.status}, Message : ${err.message}`);
                throw err;
            }
        };

        try {
            console.log(`[DEBUG] Étape 1 : requête proxy pour l'ID : ${id}, Langue : ${langName}, Fichier : ${filename}`);
            let response;
            let success = false;
            let cookies: string[] = [];

            // Stratégie 1 : scraping discret (récupération des cookies d'abord)
            try {
                console.log(`[DEBUG] Étape 2 : initialisation de la session discrète...`);
                const initRes = await axios.get('https://subtitlecat.com/', {
                    headers: commonHeaders,
                    timeout: 5000
                }).catch(() => null);
                
                if (initRes && initRes.headers['set-cookie']) {
                    cookies = initRes.headers['set-cookie'];
                }

                const scrapeUrls = [
                    `https://subtitlecat.com/subs/${id}`,
                    `https://subtitlecat.com/subs/${id}/${filename}.html`
                ];

                for (const pageUrl of scrapeUrls) {
                    console.log(`[DEBUG] Étape 2 : scraping de la page avec les cookies : ${pageUrl}`);
                    try {
                        const pageRes = await axios.get(pageUrl, {
                            headers: {
                                ...commonHeaders,
                                'Cookie': cookies.join('; '),
                                'Referer': 'https://subtitlecat.com/'
                            },
                            timeout: 8000,
                            maxRedirects: 5
                        });
                        
                        const $ = cheerio.load(pageRes.data);
                        
                        // Debug : journalise tous les liens trouvés sur la page
                        $('a').each((i, el) => {
                            const href = $(el).attr('href');
                            if (href && (href.includes('/download/') || href.includes('/subs/'))) {
                                console.log(`[DEBUG] Lien potentiel trouvé : ${href}`);
                            }
                        });
                        
                        let bestMatchPath = '';
                        let firstFrenchPath = '';
                        let downloadPath = '';

                        $('table.table tbody tr').each((i, el) => {
                            const rowText = $(el).text().toLowerCase();
                            const isFrenchAvailable = rowText.includes('french') || rowText.includes('français') || rowText.includes('francais');
                            
                            // Cherche spécifiquement le lien de téléchargement
                            const link = $(el).find('a[href^="/download/"], a[href^="/subs/"]');
                            const href = link.attr('href');
                            const linkText = link.text().toLowerCase();

                            if (isFrenchAvailable && href) {
                                if (!firstFrenchPath) firstFrenchPath = href;
                                
                                // Vérifie si le texte ou l'href du lien correspond au nom de fichier demandé
                                const filenameMatch = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
                                const linkMatch = (linkText + href).toLowerCase().replace(/[^a-z0-9]/g, '');
                                
                                if (linkMatch.includes(filenameMatch) || filenameMatch.includes(linkMatch.substring(0, Math.min(linkMatch.length, 10)))) {
                                    bestMatchPath = href;
                                    console.log(`[DEBUG] Étape 2 : meilleur lien correspondant trouvé dans le tableau : ${bestMatchPath}`);
                                    return false; // Interrompt la boucle, correspondance parfaite trouvée
                                }
                            }
                        });
                        
                        downloadPath = bestMatchPath || firstFrenchPath;
                        if (downloadPath) {
                            console.log(`[DEBUG] Étape 2 : utilisation du lien : ${downloadPath}`);
                        }

                        if (!downloadPath) {
                            downloadPath = $('#download_file').attr('href') || 
                                           $('a.btn-primary[href^="/download/"]').attr('href') || '';
                        }

                        if (downloadPath) {
                            // S'assure que l'URL est absolue
                            const fullUrl = downloadPath.startsWith('http') ? downloadPath : `https://subtitlecat.com${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;
                            console.log(`[DEBUG] Étape 3 : tentative de téléchargement final : ${fullUrl}`);
                            const srtContent = await fetchFile(fullUrl, cookies);
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            return res.send(srtContent);
                        }
                    } catch (e: any) {
                        console.log(`[DEBUG] Échec de la tentative de scraping pour ${pageUrl} : ${e.message}`);
                    }
                }
            } catch (scrapeErr: any) {
                console.log(`[DEBUG] Échec de la logique de scraping : ${scrapeErr.message}`);
            }

            // Stratégie 2 : motifs en force brute (secours)
            if (!success) {
                console.log(`[DEBUG] Le scraping n'a pas fonctionné, repli sur la force brute avec les cookies...`);
                
                const baseName = filename.replace(/\.srt$/i, '');
                const pathsToTry: string[] = [];
                
                if (lang) {
                    const langSuffix = langName === 'french' ? 'fr' : langName.substring(0, 2);
                    const variations = [
                        filename,
                        baseName,
                        filename.replace(/ /g, '-'),
                        filename.replace(/ /g, '_'),
                        filename.replace(/\./g, '-'),
                        filename.replace(/\./g, '_'),
                        filename.replace(/'/g, ''),
                        filename.replace(/'/g, '-'),
                        filename.replace(/'/g, '.'),
                        filename.replace(/'s/g, 's'),
                        filename.replace(/'s/g, '.s'),
                        filename.replace(/,/g, ''),
                        filename.replace(/,/g, '-'),
                        filename.replace(/,/g, '.'),
                        baseName.replace(/'/g, ''),
                        baseName.replace(/'/g, '-'),
                        baseName.replace(/'/g, '.'),
                        baseName.replace(/'s/g, 's'),
                        baseName.replace(/,/g, ''),
                        baseName.replace(/,/g, '-'),
                        baseName.replace(/,/g, '.')
                    ];

                    for (const v of Array.from(new Set(variations))) {
                        pathsToTry.push(`${v}/${langName}.srt`);
                        pathsToTry.push(`${v}-${langSuffix}.srt`);
                    }
                } else {
                    pathsToTry.push(filename.endsWith('.srt') ? filename : `${filename}.srt`);
                    pathsToTry.push(baseName + '.srt');
                }

                for (const pathAttempt of pathsToTry) {
                    try {
                        const encodedPath = encodeURIComponent(pathAttempt);
                        const url = `https://subtitlecat.com/download/${id}/${encodedPath}`;
                        
                        const srtContent = await fetchFile(url, cookies);
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        return res.send(srtContent);
                    } catch (e) { /* continue */ }
                }
            }

            if (!success || !response) {
                console.log(`[DEBUG] Toutes les stratégies ont échoué pour ${id}. Renvoi d'une erreur 404.`);
                return res.status(404).send('Sous-titre introuvable');
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            
            res.send(Buffer.from(response.data));
        } catch (e: any) {
            console.error(`[ERREUR] Échec du proxy pour ${id} :`, e.message);
            res.status(404).send(`Sous-titre introuvable. Erreur : ${e.message}`);
        }
    });

    // 4. Configuration du frontend
    // Utilise __dirname pour une résolution de chemin plus fiable sur Vercel
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    
    // Détermine l'environnement d'après NODE_ENV ou APP_URL
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || process.env.K_SERVICE !== undefined;
    
    if (isProd) {
        console.log(`Service des fichiers statiques depuis ${distPath}`);
        app.use(express.static(distPath));
        
        // Gère le routage de l'application monopage (SPA)
        app.get('*', (req, res, next) => {
            const url = req.url;
            if (url.startsWith('/subtitles') || url.startsWith('/proxy') || url.includes('manifest')) {
                return next();
            }
            res.sendFile(path.join(distPath, 'index.html'));
        });
    } else {
        console.log('Utilisation du middleware Vite en développement');
        // Import dynamique pour éviter de charger Vite en production/Vercel
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    }

    return app;
}

// Exporte une fonction appelable par Vercel
const appPromise = createServer();

export default async (req: any, res: any) => {
    const app = await appPromise;
    return app(req, res);
};

// N'écoute que si l'on n'est pas sur Vercel
if (!process.env.VERCEL) {
    appPromise.then(app => {
        const PORT = Number(process.env.PORT) || 3000;
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Serveur de l'addon à l'écoute sur 0.0.0.0:${PORT}`);
        });
    });
}
