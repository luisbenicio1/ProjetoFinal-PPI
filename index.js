import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createClient } from '@vercel/kv';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const kv = createClient({
  url: process.env.KV_URL,
  token: process.env.KV_REST_API_TOKEN,
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'seu-segredo-de-sessao-super-secreto',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 60 * 1000 }
}));
app.use('/static', express.static(path.join(__dirname, 'public')));

const authMiddleware = (req, res, next) =>
{
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

app.get('/login', (req, res) =>
{
  res.render('login', { error: null });
});

app.post('/login', (req, res) =>
{
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin') {
    req.session.user = { username: 'admin' };
    const agora = new Date();
    const dataHoraFormatada = agora.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    res.cookie('ultimo_acesso', dataHoraFormatada, { maxAge: 900000, httpOnly: true });
    res.redirect('/menu');
  } else {
    res.render('login', { error: 'Usuário ou senha inválidos' });
  }
});

app.get('/logout', (req, res) =>
{
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', authMiddleware, (req, res) =>
{
  res.redirect('/menu');
});

app.get('/menu', authMiddleware, (req, res) =>
{
  const ultimoAcesso = req.cookies.ultimo_acesso || 'Primeiro acesso.';
  res.render('menu', { ultimoAcesso });
});

app.get('/cadastrar-equipe', authMiddleware, (req, res) =>
{
  res.render('cadastrar-equipe', { error: null, success: null });
});

app.post('/cadastrar-equipe', authMiddleware, async (req, res) =>
{
  const { nomeEquipe, nomeTecnico, telefoneTecnico } = req.body;
  if (!nomeEquipe || !nomeTecnico || !telefoneTecnico) {
    return res.render('cadastrar-equipe', { error: 'Todos os campos são obrigatórios.', success: null });
  }
  try {
    const id = `equipe:${Date.now()}`;
    await kv.hset(id, { id, nomeEquipe, nomeTecnico, telefoneTecnico });
    res.redirect('/listar-equipes');
  } catch (error) {
    res.render('cadastrar-equipe', { error: 'Erro ao salvar a equipe.', success: null });
  }
});

app.get('/listar-equipes', authMiddleware, async (req, res) =>
{
  try {
    const keys = await kv.keys('equipe:*');
    if (keys.length === 0) {
        return res.render('listar-equipes', { equipes: [] });
    }
    const equipes = await kv.mget(...keys);
    res.render('listar-equipes', { equipes });
  } catch (error) {
    res.status(500).send("Erro ao buscar equipes.");
  }
});

app.get('/cadastrar-jogador', authMiddleware, async (req, res) =>
{
  try {
    const equipeKeys = await kv.keys('equipe:*');
    if (equipeKeys.length === 0) {
        return res.render('cadastrar-jogador', { equipes: [], error: 'Cadastre uma equipe primeiro!', success: null });
    }
    const equipes = await kv.mget(...equipeKeys);
    res.render('cadastrar-jogador', { equipes, error: null, success: null });
  } catch (error) {
    res.status(500).send("Erro ao carregar o formulário.");
  }
});

app.post('/cadastrar-jogador', authMiddleware, async (req, res) =>
{
  const { nome, numero, nascimento, altura, genero, posicao, equipeId } = req.body;
  let equipes = [];
  try {
    const equipeKeys = await kv.keys('equipe:*');
    if (equipeKeys.length > 0) {
        equipes = await kv.mget(...equipeKeys);
    }

    if (!nome || !numero || !nascimento || !altura || !genero || !posicao || !equipeId) {
      return res.render('cadastrar-jogador', { equipes, error: 'Todos os campos são obrigatórios.', success: null });
    }

    const jogadoresDaEquipeKeys = await kv.keys(`jogador:*-${equipeId}`);
    if (jogadoresDaEquipeKeys.length >= 6) {
      return res.render('cadastrar-jogador', { equipes, error: 'A equipe selecionada já possui 6 jogadores.', success: null });
    }

    const id = `jogador:${Date.now()}-${equipeId}`;
    await kv.hset(id, { id, nome, numero, nascimento, altura, genero, posicao, equipeId });
    res.redirect('/listar-jogadores');

  } catch (error) {
    console.error(error);
    res.render('cadastrar-jogador', { equipes, error: 'Erro ao salvar o jogador.', success: null });
  }
});

app.get('/listar-jogadores', authMiddleware, async (req, res) =>
{
  try {
    const jogadorKeys = await kv.keys('jogador:*');
    const equipeKeys = await kv.keys('equipe:*');

    if (jogadorKeys.length === 0) {
        return res.render('listar-jogadores', { jogadoresPorEquipe: {} });
    }

    const jogadores = await kv.mget(...jogadorKeys);
    const equipes = equipeKeys.length > 0 ? await kv.mget(...equipeKeys) : [];

    const equipesMap = equipes.reduce((acc, equipe) => {
      acc[equipe.id] = equipe;
      return acc;
    }, {});
    
    const jogadoresPorEquipe = {};

    jogadores.forEach(jogador => {
      if (!jogadoresPorEquipe[jogador.equipeId]) {
        jogadoresPorEquipe[jogador.equipeId] = {
          equipe: equipesMap[jogador.equipeId] || { nomeEquipe: 'Equipe não encontrada' },
          jogadores: []
        };
      }
      jogadoresPorEquipe[jogador.equipeId].jogadores.push(jogador);
    });

    res.render('listar-jogadores', { jogadoresPorEquipe });
  } catch (error) {
    res.status(500).send("Erro ao buscar jogadores.");
  }
});

app.listen(PORT, () =>
{
  console.log(`Servidor rodando na porta ${PORT}`);
});