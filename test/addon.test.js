'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const addon = require('../api/index');

function mockFetch({ type = 'movie', cert = '14', cinemeta = true, status = 200, missing = false } = {}) {
  return async (input) => {
    const url = new URL(input);
    if (url.hostname === 'v3-cinemeta.strem.io') {
      if (!cinemeta) throw new Error('offline');
      return { ok: true, json: async () => ({ meta: { name: 'Cinemeta', videos: [{ id: 'tt1234567:1:1', season: 1, episode: 1 }] } }) };
    }
    if (status !== 200) return { ok: false, status };
    if (url.pathname.startsWith('/3/find/')) return { ok: true, json: async () => type === 'movie' ? { movie_results: missing ? [] : [{ id: 1 }] } : { tv_results: missing ? [] : [{ id: 1 }] } };
    return { ok: true, json: async () => type === 'movie' ? {
      title: 'Filme', overview: 'Sinopse', runtime: 110, genres: [{ name: 'Drama' }],
      release_dates: { results: [{ iso_3166_1: 'BR', release_dates: [{ certification: '' }, { certification: cert, note: 'não é motivo' }] }] }
    } : {
      name: 'Série', overview: 'Sinopse', genres: [],
      content_ratings: { results: [{ iso_3166_1: 'BR', rating: cert }] }
    } };
  };
}

test('filme escolhe classificação brasileira não vazia e não inventa motivo', async () => {
  const meta = await addon.getMeta('movie', 'tt1234567', 'fake', mockFetch());
  assert.match(meta.description, /Brasil: 14/);
  assert.match(meta.description, /Motivo da classificação: não disponível/);
  assert.doesNotMatch(meta.description, /não é motivo/);
  assert.equal(meta.runtime, '110 min');
});
test('série preserva os episódios do Cinemeta', async () => {
  const meta = await addon.getMeta('series', 'tt1234567', 'fake', mockFetch({ type: 'series', cert: '16' }));
  assert.equal(meta.videos[0].id, 'tt1234567:1:1');
  assert.match(meta.description, /Brasil: 16/);
});
test('série sem episódios retorna erro em vez de metadados incompletos', async () => {
  await assert.rejects(addon.getMeta('series', 'tt1234567', 'fake', mockFetch({ type: 'series', cinemeta: false })), /Episódios indisponíveis/);
});
test('filme sem Cinemeta e sem classificação mantém dados básicos', async () => {
  const meta = await addon.getMeta('movie', 'tt1234567', 'fake', mockFetch({ cinemeta: false, cert: '' }));
  assert.equal(meta.name, 'Filme');
  assert.match(meta.description, /não informada no TMDB/);
});
test('obra inexistente retorna null', async () => {
  assert.equal(await addon.getMeta('movie', 'tt1234567', 'fake', mockFetch({ missing: true })), null);
});
test('falha de credencial não é confundida com ausência de resultado', async () => {
  await assert.rejects(addon.getMeta('movie', 'tt1234567', 'fake', mockFetch({ status: 401 })), /HTTP 401/);
  await assert.rejects(addon.getMeta('movie', 'tt1234567', '', mockFetch()), /não configurada/);
});
test('manifesto, rotas e erro de configuração via HTTP', async (t) => {
  const oldKey = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  const server = http.createServer(addon);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); if (oldKey !== undefined) process.env.TMDB_API_KEY = oldKey; });
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = await fetch(base + '/manifest.json');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual((await manifest.json()).types, ['movie', 'series']);
  assert.equal((await fetch(base + '/meta/movie/tt1234567.json')).status, 503);
  assert.equal((await fetch(base + '/meta/series/not-an-id.json')).status, 404);
  assert.equal((await fetch(base + '/manifest.json', { method: 'POST' })).status, 405);
});
