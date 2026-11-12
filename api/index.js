const { addonBuilder } = require("stremio-addon-sdk");
const cheerio = require("cheerio");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

const manifest = {
    id: "community.classificacao.detalhada.v3",
    version: "3.0.0",
    name: "Classificação Detalhada V3",
    description: "Mostra classificação indicativa + motivo detalhado",
    resources: ["meta"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);
const cache = new Map();

async function getTmdbId(imdbId, type) {
    try {
        const res = await fetch(`${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
        const data = await res.json();
        if (type === "movie" && data.movie_results[0]) return data.movie_results[0].id;
        if (type === "series" && data.tv_results[0]) return data.tv_results[0].id;
        return null;
    } catch { return null; }
}

async function getClassificacaoBR(tmdbId, type) {
    try {
        if (type === "movie") {
            const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`);
            const data = await res.json();
            const br = data.results?.find(r => r.iso_3166_1 === "BR");
            const rel = br?.release_dates?.reverse().find(r => r.certification);
            return rel?.certification || "";
        } else {
            const res = await fetch(`${TMDB_BASE}/tv/${tmdbId}/content_ratings?api_key=${TMDB_API_KEY}`);
            const data = await res.json();
            const br = data.results?.find(r => r.iso_3166_1 === "BR");
            return br?.rating || "";
        }
    } catch { return ""; }
}

async function getParentsGuideDetalhado(imdbId) {
    try {
        const res = await fetch(`https://www.imdb.com/title/${imdbId}/parentalguide/`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" }
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        let resultado = {};
        const secoes = { "Sex & Nudity": "Sexo e Nudez", "Violence & Gore": "Violência e Sangue", "Profanity": "Linguagem Imprópria", "Alcohol, Drugs & Smoking": "Álcool, Drogas e Fumo", "Frightening & Intense Scenes": "Cenas Assustadoras" };
        $('section').each((i, el) => {
            const titulo = $(el).find('h3, h2').first().text().trim();
            for (let [en, pt] of Object.entries(secoes)) {
                if (titulo.includes(en)) {
                    let textos = [];
                    $(el).find('li, div.ipc-html-content-inner-div, p').each((j, p) => {
                        let t = $(p).text().trim();
                        if (t.length > 20 && t.length < 800 && !t.includes("Edit")) textos.push(t);
                    });
                    textos = [...new Set(textos)].slice(0, 3);
                    if (textos.length > 0) resultado[pt] = textos;
                }
            }
        });
        return resultado;
    } catch { return {}; }
}

function traduzirTrecho(texto) {
    return texto.replace(/blood/gi, "sangue").replace(/gore/gi, "mutilação").replace(/mutilation/gi, "mutilação").replace(/torture/gi, "tortura").replace(/sexual content/gi, "conteúdo sexual").replace(/nudity/gi, "nudez");
}

builder.defineMetaHandler(async ({ type, id }) => {
    if (cache.has(id)) return { meta: { id, type, description: cache.get(id) } };
    const tmdbId = await getTmdbId(id, type);
    const cert = tmdbId ? await getClassificacaoBR(tmdbId, type) : "";
    const guide = await getParentsGuideDetalhado(id);
    if (!cert && Object.keys(guide).length === 0) return { meta: null };
    let certTexto = cert === "L" ? "Livre" : cert ? cert + "+" : "Sem classificação BR";
    let descricao = `CLASSIFICAÇÃO INDICATIVA: ${certTexto}\n\n`;
    if (Object.keys(guide).length > 0) {
        descricao += `MOTIVO DETALHADO:\n`;
        for (let [categoria, textos] of Object.entries(guide)) {
            descricao += `\n🔞 ${categoria.toUpperCase()}:\n`;
            for (let t of textos) descricao += `• ${traduzirTrecho(t)}\n`;
        }
    }
    descricao += `\n---\nFonte: ClassInd Brasil + IMDb Parents Guide`;
    cache.set(id, descricao);
    return { meta: { id, type, description: descricao } };
});

module.exports = builder.getInterface();
