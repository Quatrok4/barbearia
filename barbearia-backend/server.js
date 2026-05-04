const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Banco de dados
const db = new sqlite3.Database("./database.db");

// Criar tabela de usuários
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    email TEXT UNIQUE,
    senha TEXT
  )
`);

// Criar tabela de agendamentos
db.run(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    data TEXT,
    horario TEXT
  )
`);

// Teste
app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});

app.post("/register", (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  const sql = "INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)";

  db.run(sql, [nome, email, senha], function (err) {
    if (err) {
      return res.status(500).json({ erro: "Erro ao cadastrar usuário" });
    }

    res.json({ mensagem: "Usuário cadastrado com sucesso" });
  });
});

app.post("/login", (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  const sql = "SELECT * FROM users WHERE email = ? AND senha = ?";

  db.get(sql, [email, senha], (err, user) => {
    if (err) {
      return res.status(500).json({ erro: "Erro no servidor" });
    }

    if (!user) {
      return res.status(401).json({ erro: "Email ou senha inválidos" });
    }

    res.json({ mensagem: "Login realizado com sucesso", user });
  });
});

app.post("/agendar", (req, res) => {
  const { user_id, data, horario } = req.body;

  if (!user_id || !data || !horario) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  // Verificar se já existe agendamento nesse horário
  const checkSql = "SELECT * FROM agendamentos WHERE data = ? AND horario = ?";

  db.get(checkSql, [data, horario], (err, existing) => {
    if (err) {
      return res.status(500).json({ erro: "Erro no servidor" });
    }

    if (existing) {
      return res.status(400).json({ erro: "Horário já ocupado" });
    }

    // Inserir agendamento
    const insertSql = "INSERT INTO agendamentos (user_id, data, horario) VALUES (?, ?, ?)";

    db.run(insertSql, [user_id, data, horario], function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao agendar" });
      }

      res.json({ mensagem: "Agendamento realizado com sucesso" });
    });
  });
});

app.get("/agendamentos", (req, res) => {
  const { data } = req.query;

  const sql = "SELECT horario FROM agendamentos WHERE data = ?";

  db.all(sql, [data], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: "Erro ao buscar agendamentos" });
    }

    res.json(rows);
  });
});