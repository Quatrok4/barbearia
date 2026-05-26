
// ========================================
// IMPORTAÇÕES
// ========================================
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Chave secreta JWT
const SECRET = "barbearia-secret";

// ========================================
// CONFIGURAÇÕES INICIAIS
// ========================================
const app = express();
app.use(express.json());
app.use(cors());

// Banco de dados
const db = new sqlite3.Database("./barbearia.db", (err) => {
  if (err) {
    console.error("Erro ao conectar ao banco de dados:", err);
  } else {
    console.log("Conectado ao banco de dados");
  }
});

// Criar tabela de usuários
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    email TEXT UNIQUE,
    senha TEXT,
    perfil TEXT DEFAULT 'comum'
  )
`, (err) => {
  if (err) {
    console.log("Erro ao criar tabela users");
  } else {
    console.log("Tabela users pronta");
  }
});


// ========================================
// TABELA DE AGENDAMENTOS
// ========================================
db.run(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    data TEXT,
    horario TEXT
  )
`);

// ========================================
// TESTE API
// ========================================
app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

// ========================================
// INICIAR SERVIDOR
// ========================================
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});

// ========================================
// CADASTRO DE USUÁRIO
// ========================================
app.post("/register", async (req, res) => {
  const { nome, email, senha } = req.body;

  // Validação de campos
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

// Senha mínima
  if (senha.length < 8) {
    return res.status(400).json({
      erro: "A senha deve ter no mínimo 8 caracteres"
    });
  }

  try {

    // criptografa senha
    const senhaHash = await bcrypt.hash(senha, 10);

    const sql = `
      INSERT INTO users (nome, email, senha, perfil)
VALUES (?, ?, ?, ?)
    `;

    // Salva usuário no banco
    db.run(sql, [nome, email, senhaHash, "comum"], function(err) {

      if (err) {
        return res.status(500).json({
          erro: "Erro ao cadastrar usuário"
        });
      }

      res.json({
        mensagem: "Usuário cadastrado com sucesso"
      });

    });

  } catch (error) {

    res.status(500).json({
      erro: "Erro no servidor"
    });

  }
});


// ========================================
// LOGIN
// ========================================
app.post("/login", (req, res) => {

  const { email, senha } = req.body;

  // Validação de campos
  if (!email || !senha) {
    return res.status(400).json({
      erro: "Preencha todos os campos"
    });
  }

  const sql = "SELECT * FROM users WHERE email = ?";

  db.get(sql, [email], async (err, user) => {

    if (err) {
      return res.status(500).json({
        erro: "Erro no servidor"
      });
    }

    // Usuário não encontrado
    if (!user) {
      return res.status(401).json({
        erro: "Usuário não encontrado"
      });
    }

    // compara senha digitada com hash
    const senhaValida = await bcrypt.compare(
      senha,
      user.senha
    );

    // Senha inválida
    if (!senhaValida) {
      return res.status(401).json({
        erro: "Senha inválida"
      });
    }

    // Gera token JWT
    const token = jwt.sign(

  {
    id: user.id,
    perfil: user.perfil
  },

  SECRET,

  {
    expiresIn: "1d"
  }

);

// Retorna login bem-sucedido com token e dados do usuário
res.json({
  mensagem: "Login realizado com sucesso",
  token,
  user
});

  });

});

// ========================================
// AGENDAR HORÁRIO
// ========================================
app.post("/agendar", (req, res) => {
  const { user_id, data, horario } = req.body;

  // Validação
  if (!user_id || !data || !horario) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  // Verifica se já existe agendamento nesse horário
  const checkSql = "SELECT * FROM agendamentos WHERE data = ? AND horario = ?";

  db.get(checkSql, [data, horario], (err, existing) => {
    if (err) {
      return res.status(500).json({ erro: "Erro no servidor" });
    }

    // Impede agendamento duplicado
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

// ========================================
// LISTAR AGENDAMENTOS
// ========================================
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

// ========================================
// RECUPERAR SENHA
// ========================================
app.put("/recuperar", (req, res) => {
  const { email, novaSenha } = req.body;

  // Validação
  if (!email || !novaSenha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  const sql = "UPDATE users SET senha = ? WHERE email = ?";

  db.run(sql, [novaSenha, email], function (err) {
    if (err) {
      return res.status(500).json({ erro: "Erro no servidor" });
    }

    // Email não encontrado
    if (this.changes === 0) {
      return res.status(404).json({ erro: "Email não encontrado" });
    }

    res.json({ mensagem: "Senha atualizada com sucesso" });
  });
});

// ========================================
// TRANSFORMAR USUÁRIO EM MASTER
// ========================================
app.put("/virar-master/:id", (req, res) => {

  const { id } = req.params;

  const sql = `
    UPDATE users
    SET perfil = 'master'
    WHERE id = ?
  `;

  db.run(sql, [id], function(err) {

    if (err) {
      return res.status(500).json({
        erro: "Erro ao atualizar perfil"
      });
    }

    res.json({
      mensagem: "Usuário virou master com sucesso"
    });

  });

});

// ========================================
// MIDDLEWARE JWT
// ========================================
function verificarToken(req, res, next) {

  const authHeader = req.headers.authorization;

  // Token não enviado
  if (!authHeader) {
    return res.status(401).json({
      erro: "Token não fornecido"
    });
  }

  const token = authHeader.split(" ")[1];

  try {

    // Valida token
    const decoded = jwt.verify(token, SECRET);

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      erro: "Token inválido"
    });

  }
}

// ========================================
// MIDDLEWARE MASTER
// ========================================
function verificarMaster(req, res, next) {

  const perfil = req.user.perfil;

  // Bloqueia usuários comuns
  if (perfil !== "master") {

    return res.status(403).json({
      erro: "Acesso negado"
    });

  }

  next();
}

// ========================================
// LISTAR USUÁRIOS
// ========================================
app.get("/usuarios", (req, res) => {
  const sql = `
    SELECT id, nome, email, perfil
    FROM users
  `;

  db.all(sql, [], (err, users) => {

    if (err) {
      return res.status(500).json({
        erro: "Erro ao buscar usuários"
      });
    }

    res.json(users);

  });

});

// ========================================
// DELETAR USUÁRIO
// ========================================
app.delete("/usuarios/:id", verificarToken, verificarMaster, (req, res) => {
  const { id } = req.params;

  const sql = `
    DELETE FROM users
    WHERE id = ?
  `;

  db.run(sql, [id], function(err) {

    if (err) {
      return res.status(500).json({
        erro: "Erro ao deletar usuário"
      });
    }

     // Usuário não encontrado
    if (this.changes === 0) {
      return res.status(404).json({
        erro: "Usuário não encontrado"
      });
    }

    res.json({
      mensagem: "Usuário deletado com sucesso"
    });

  });

});