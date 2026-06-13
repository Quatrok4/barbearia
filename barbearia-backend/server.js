require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const app = express();
app.use(express.json());
app.use(cors());

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  realtime: { transport: ws },
});

// ─── Resend (envio de email) ────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getIP(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "desconhecido";
}

async function registrarLog(tipo, descricao, user_id = null, ip = null) {
  await supabase.from("logs").insert([{ tipo, descricao, user_id, ip }]);
}

// ─── TESTE ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "API funcionando 🚀" });
});

// ─── CADASTRO ────────────────────────────────────────────────────────────────
app.post("/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha)
      return res.status(400).json({ erro: "Preencha todos os campos" });

    const { data: existe } = await supabase
      .from("users").select("id").eq("email", email).maybeSingle();

    if (existe)
      return res.status(400).json({ erro: "Email já cadastrado" });

    const senhaHash = await bcrypt.hash(senha, 10);

    const { error } = await supabase
      .from("users").insert([{ nome, email, senha: senhaHash }]);

    if (error) {
      await registrarLog("erro", `Erro ao cadastrar: ${error.message}`);
      return res.status(500).json({ erro: "Erro ao cadastrar usuário" });
    }

    res.json({ mensagem: "Usuário cadastrado com sucesso" });
  } catch (err) {
    await registrarLog("erro", `Exceção /register: ${err.message}`);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── LOGIN passo 1 — valida senha e envia código 2FA ─────────────────────────
app.post("/login", async (req, res) => {
  const ip = getIP(req);
  try {
    const { email, senha } = req.body;

    if (!email || !senha)
      return res.status(400).json({ erro: "Preencha todos os campos" });

    const { data: user } = await supabase
      .from("users").select("*").eq("email", email).maybeSingle();

    if (!user || !(await bcrypt.compare(senha, user.senha))) {
      await registrarLog("login_invalido", `Tentativa falhou para: ${email}`, null, ip);
      return res.status(401).json({ erro: "Email ou senha inválidos" });
    }

    const codigo   = gerarCodigo();
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from("dois_fatores").insert([{
      user_id: user.id, codigo, expira_em: expiraEm, usado: false
    }]);

    await resend.emails.send({
      from: "Barbearia Prime <noreply@barbeariaprime.api.br>",
      to: user.email,
      subject: "Seu código de verificação — Barbearia Prime",
      html: `
        <div style="font-family:Arial;max-width:400px;margin:auto;padding:30px;border:1px solid #eee;border-radius:12px;">
          <h2 style="color:#c59d5f;">✂ Barbearia Prime</h2>
          <p>Seu código de verificação é:</p>
          <h1 style="letter-spacing:8px;color:#333;">${codigo}</h1>
          <p style="color:#888;font-size:13px;">Válido por 10 minutos. Não compartilhe com ninguém.</p>
        </div>
      `
    });

    res.json({ mensagem: "Código enviado para seu email", user_id: user.id });
  } catch (err) {
    await registrarLog("erro", `Exceção /login: ${err.message}`, null, ip);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── LOGIN passo 2 — valida código 2FA ───────────────────────────────────────
app.post("/verificar-2fa", async (req, res) => {
  const ip = getIP(req);
  try {
    const { user_id, codigo } = req.body;

    if (!user_id || !codigo)
      return res.status(400).json({ erro: "Dados incompletos" });

    const { data: registro } = await supabase
      .from("dois_fatores")
      .select("*")
      .eq("user_id", user_id)
      .eq("codigo", codigo)
      .eq("usado", false)
      .gte("expira_em", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!registro) {
      await registrarLog("login_invalido", `Código 2FA inválido para user_id: ${user_id}`, user_id, ip);
      return res.status(401).json({ erro: "Código inválido ou expirado" });
    }

    await supabase.from("dois_fatores").update({ usado: true }).eq("id", registro.id);

    const { data: user } = await supabase
      .from("users").select("id, nome, email").eq("id", user_id).single();

    await registrarLog("login", `Login realizado: ${user.email}`, user.id, ip);

    res.json({ mensagem: "Login realizado com sucesso", user });
  } catch (err) {
    await registrarLog("erro", `Exceção /verificar-2fa: ${err.message}`, null, ip);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
app.post("/logout", async (req, res) => {
  const ip = getIP(req);
  try {
    const { user_id } = req.body;
    await registrarLog("logout", `Logout do user_id: ${user_id}`, user_id, ip);
    res.json({ mensagem: "Logout registrado" });
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── AGENDAR ─────────────────────────────────────────────────────────────────
app.post("/agendar", async (req, res) => {
  const ip = getIP(req);
  try {
    const { user_id, data, horario } = req.body;

    if (!user_id || !data || !horario)
      return res.status(400).json({ erro: "Preencha todos os campos" });

    const { data: existing } = await supabase
      .from("agendamentos").select("id")
      .eq("data", data).eq("horario", horario).maybeSingle();

    if (existing)
      return res.status(400).json({ erro: "Horário já ocupado" });

    const { error } = await supabase
      .from("agendamentos").insert([{ user_id, data, horario }]);

    if (error) {
      await registrarLog("erro", `Erro ao agendar: ${error.message}`, user_id, ip);
      return res.status(500).json({ erro: "Erro ao agendar" });
    }

    await registrarLog("agendamento", `Agendamento criado: ${data} às ${horario}`, user_id, ip);
    res.json({ mensagem: "Agendamento realizado com sucesso" });
  } catch (err) {
    await registrarLog("erro", `Exceção /agendar: ${err.message}`, null, ip);
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── AGENDAMENTOS POR DATA ───────────────────────────────────────────────────
app.get("/agendamentos", async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ erro: "Informe a data" });

    const { data: rows, error } = await supabase
      .from("agendamentos").select("horario").eq("data", data);

    if (error) return res.status(500).json({ erro: "Erro ao buscar" });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── BUSCA PARCIAL — USUÁRIOS ────────────────────────────────────────────────
app.get("/buscar/usuarios", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2)
      return res.status(400).json({ erro: "Digite ao menos 2 caracteres" });

    const { data: usuarios, error } = await supabase
      .from("users")
      .select("id, nome, email")
      .or(`nome.ilike.%${q}%,email.ilike.%${q}%`);

    if (error) return res.status(500).json({ erro: "Erro na busca" });

    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── BUSCA PARCIAL — AGENDAMENTOS ────────────────────────────────────────────
app.get("/buscar/agendamentos", async (req, res) => {
  try {
    const { data, horario } = req.query;

    if (!data && !horario)
      return res.status(400).json({ erro: "Informe data ou horário para buscar" });

    let query = supabase.from("agendamentos").select("*");

    if (data)    query = query.ilike("data", `%${data}%`);
    if (horario) query = query.ilike("horario", `%${horario}%`);

    const { data: resultados, error } = await query;

    if (error) return res.status(500).json({ erro: "Erro na busca" });

    res.json(resultados);
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── LOGS ────────────────────────────────────────────────────────────────────
app.get("/logs", async (req, res) => {
  try {
    const { tipo, limit = 50 } = req.query;

    let query = supabase
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (tipo) query = query.eq("tipo", tipo);

    const { data: rows, error } = await query;

    if (error) return res.status(500).json({ erro: "Erro ao buscar logs" });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(3000, () => console.log("Servidor rodando na porta 3000 ✅"));