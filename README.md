# Classificação Indicativa Brasil

Addon de metadados para Stremio que procura a classificação indicativa brasileira de filmes e séries pelo ID IMDb no TMDB. A classificação aparece no início da descrição, quando o Stremio exibe os metadados deste addon. O TMDB não informa o motivo da classificação: o addon não apresenta notas de lançamento como se fossem motivos.

## Configuração

1. Obtenha uma chave de API do TMDB em https://www.themoviedb.org/settings/api. Use uma nova chave se alguma chave anterior foi exposta no histórico público do repositório.
2. Configure `TMDB_API_KEY` como variável de ambiente no servidor. Nunca coloque a chave no código nem publique-a.
3. Na Vercel, importe o repositório, configure `TMDB_API_KEY` nas variáveis de ambiente e faça um novo deploy. Em seguida abra `https://SEU-DOMINIO/manifest.json` e instale esse endereço como addon no Stremio.
4. Para rodar localmente, use Node.js 20 ou superior: `TMDB_API_KEY=sua_chave node api/index.js`. O manifesto estará em `http://localhost:3000/manifest.json`. `node --test` executa os testes sem instalar dependências.

Ao receber dados do Cinemeta, o addon os preserva, incluindo episódios de séries. Se os episódios de uma série não estiverem disponíveis no Cinemeta, o addon retorna um erro temporário em vez de apresentar uma série incompleta. Para filmes, os dados básicos podem vir do TMDB. A disponibilidade e a classificação variam conforme os dados do TMDB. Outros addons, inclusive Cinemeta, podem ser priorizados pelo aplicativo Stremio: instalar este addon não garante que sua descrição apareça no cliente. Teste no dispositivo e confira a ordem dos addons.

A chave removida do código permanece no histórico do Git. Revogue-a no TMDB e crie outra; remover o arquivo atual não revoga o segredo.
