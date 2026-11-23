'use strict';

const http = require('node:http');

const manifest = {
  id: 'community.classificacao.detalhada.v3',
  version: '3.1.0',
  name: 'Classificação Indicativa Brasil',
  description: 'Classificação indicativa brasileira de filmes e séries, quando disponível no TMDB.',
  resources: ['meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: []
};

class UpstreamError extends Error {}

async function jsonFetch(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new UpstreamError(`Serviço externo retornou HTTP ${response.status}`);
  return response.json();
}

function tmdbUrl(path, key, extra = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', key);
  for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, value);
  return url.toString();
}

function certificate(data, type) {
  if (type === 'movie') {
    const entries = data.release_dates?.results?.find(x => x.iso_3166_1 === 'BR')?.release_dates || [];
    return entries.find(x => typeof x.certification === 'string' && x.certification.trim())?.certification.trim() || '';
  }
  return data.content_ratings?.results?.find(x => x.iso_3166_1 === 'BR')?.rating?.trim() || '';
}

async function getMeta(type, id, key, fetchImpl = fetch) {
  if (!key) throw new Error('TMDB_API_KEY não configurada');
  const find = await jsonFetch(tmdbUrl(`/find/${id}`, key, { external_source: 'imdb_id', language: 'pt-BR' }), fetchImpl);
  const tmdbId = (type === 'movie' ? find.movie_results : find.tv_results)?.[0]?.id;
  if (!tmdbId) return null;
  const kind = type === 'movie' ? 'movie' : 'tv';
  const append = type === 'movie' ? 'release_dates' : 'content_ratings';
  const [data, cinemeta] = await Promise.all([
    jsonFetch(tmdbUrl(`/${kind}/${tmdbId}`, key, { language: 'pt-BR', append_to_response: append }), fetchImpl),
    jsonFetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`, fetchImpl).catch(() => null)
  ]);
  const base = cinemeta?.meta && typeof cinemeta.meta === 'object' ? cinemeta.meta : {};
  if (type === 'series' && !Array.isArray(base.videos)) {
    throw new UpstreamError('Episódios indisponíveis no Cinemeta');
  }
  const cert = certificate(data, type);
  const classification = `Classificação indicativa no Brasil: ${cert || 'não informada no TMDB'}.`;
  const description = [classification, 'Motivo da classificação: não disponível no TMDB.', data.overview || base.description || ''].filter(Boolean).join('\n\n');
  const meta = {
    ...base,
    id,
    type,
    name: data.title || data.name || base.name || id,
    description,
    genres: data.genres?.map(g => g.name).filter(Boolean) || base.genres || []
  };
  if (data.poster_path) meta.poster = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
  if (data.backdrop_path) meta.background = `https://image.tmdb.org/t/p/original${data.backdrop_path}`;
  const date = data.release_date || data.first_air_date;
  if (date) meta.releaseInfo = date.slice(0, 4);
  if (type === 'movie' && data.runtime) meta.runtime = `${data.runtime} min`;
  return meta;
}

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/' || path === '/manifest.json') return send(res, 200, manifest);
  const match = path.match(/^\/meta\/(movie|series)\/(tt\d+)\.json$/);
  if (!match) return send(res, 404, { error: 'Rota não encontrada' });
  if (!process.env.TMDB_API_KEY) return send(res, 503, { error: 'TMDB_API_KEY não configurada no servidor' });
  try {
    const meta = await getMeta(match[1], match[2], process.env.TMDB_API_KEY);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return send(res, 200, { meta });
  } catch (error) {
    // Never log request URLs: TMDB credentials are in the query string.
    console.error('Falha ao consultar metadados:', error instanceof UpstreamError ? error.message : error.name);
    return send(res, 502, { error: 'Não foi possível consultar os metadados. Tente novamente.' });
  }
}

module.exports = handler;
module.exports.getMeta = getMeta;
module.exports.certificate = certificate;
module.exports.manifest = manifest;

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  http.createServer(handler).listen(port, () => console.log(`Addon disponível em http://localhost:${port}/manifest.json`));
}
