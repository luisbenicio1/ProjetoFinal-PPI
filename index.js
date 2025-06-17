import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Armazenamento em memória
let equipes = [];
let jogadores = [];
let nextEquipeId = 1;
let nextJogadorId = 1;

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

app.post('/cadastrar-equipe', authMiddleware, (req, res) =>
{
  const { nomeEquipe, nomeTecnico, telefoneTecnico } = req.body;
  if (!nomeEquipe || !nomeTecnico || !telefoneTecnico) {
    return res.render('cadastrar-equipe', { error: 'Todos os campos são obrigatórios.', success: null });
  }

  const novaEquipe = {
    id: nextEquipeId++,
    nomeEquipe,
    nomeTecnico,
    telefoneTecnico
  };
  equipes.push(novaEquipe);

  res.redirect('/listar-equipes');
});

app.get('/listar-equipes', authMiddleware, (req, res) =>
{
  res.render('listar-equipes', { equipes: equipes });
});

app.get('/cadastrar-jogador', authMiddleware, (req, res) =>
{
    if (equipes.length === 0) {
        return res.render('cadastrar-jogador', { equipes: [], error: 'Cadastre uma equipe primeiro!', success: null });
    }
    res.render('cadastrar-jogador', { equipes: equipes, error: null, success: null });
});

app.post('/cadastrar-jogador', authMiddleware, (req, res) =>
{
  const { nome, numero, nascimento, altura, genero, posicao, equipeId } = req.body;

  if (!nome || !numero || !nascimento || !altura || !genero || !posicao || !equipeId) {
    return res.render('cadastrar-jogador', { equipes: equipes, error: 'Todos os campos são obrigatórios.', success: null });
  }

  const jogadoresDaEquipe = jogadores.filter(j => j.equipeId == equipeId);
  if (jogadoresDaEquipe.length >= 6) {
    return res.render('cadastrar-jogador', { equipes: equipes, error: 'A equipe selecionada já possui 6 jogadores.', success: null });
  }
  
  const novoJogador = {
      id: nextJogadorId++,
      nome,
      numero,
      nascimento,
      altura,
      genero,
      posicao,
      equipeId: parseInt(equipeId)
  };
  jogadores.push(novoJogador);

  res.redirect('/listar-jogadores');
});

app.get('/listar-jogadores', authMiddleware, (req, res) =>
{
    const jogadoresPorEquipe = {};

    jogadores.forEach(jogador => {
      const equipeDoJogador = equipes.find(e => e.id === jogador.equipeId);
      if (!equipeDoJogador) return;

      if (!jogadoresPorEquipe[jogador.equipeId]) {
        jogadoresPorEquipe[jogador.equipeId] = {
          equipe: equipeDoJogador,
          jogadores: []
        };
      }
      jogadoresPorEquipe[jogador.equipeId].jogadores.push(jogador);
    });

    res.render('listar-jogadores', { jogadoresPorEquipe });
});

app.listen(PORT, () =>
{
  console.log(`Servidor rodando na porta ${PORT}`);
});
