const API = "https://barbearia-backend.onrender.com";

// ─── CADASTRO ────────────────────────────────────────────────────────────────
async function cadastrar() {
  const nome  = document.getElementById("nome")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const senha = document.getElementById("senha")?.value.trim();

  if (!nome || !email || !senha) return alert("Preencha todos os campos!");

  try {
    const res  = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha })
    });
    const data = await res.json();

    if (res.ok) {
      alert("Cadastro realizado! Faça login.");
      window.location.href = "login.html";
    } else {
      alert(data.erro || "Erro ao cadastrar.");
    }
  } catch (err) {
    alert("Erro ao conectar com o servidor.");
  }
}

// ─── LOGIN passo 1 — envia código 2FA ────────────────────────────────────────
async function login() {
  const email = document.getElementById("email")?.value.trim();
  const senha = document.getElementById("senha")?.value.trim();

  if (!email || !senha) return alert("Preencha todos os campos!");

  try {
    const res  = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();

    if (res.ok) {
      // Guarda user_id temporariamente para o passo 2
      localStorage.setItem("pending_user_id", data.user_id);

      // Mostra o campo de código 2FA
      document.getElementById("login-form").style.display  = "none";
      document.getElementById("form-2fa").style.display    = "block";
    } else {
      alert(data.erro || "Credenciais inválidas.");
    }
  } catch (err) {
    alert("Erro ao conectar com o servidor.");
  }
}

// ─── LOGIN passo 2 — verifica código 2FA ─────────────────────────────────────
async function verificar2fa() {
  const codigo  = document.getElementById("codigo-2fa")?.value.trim();
  const user_id = localStorage.getItem("pending_user_id");

  if (!codigo) return alert("Digite o código recebido por email.");

  try {
    const res  = await fetch(`${API}/verificar-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, codigo })
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.removeItem("pending_user_id");
      localStorage.setItem("user", JSON.stringify(data.user));
      alert("Login realizado com sucesso!");
      window.location.href = "agendamento.html";
    } else {
      alert(data.erro || "Código inválido.");
    }
  } catch (err) {
    alert("Erro ao conectar com o servidor.");
  }
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
async function logout() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (user) {
    await fetch(`${API}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id })
    }).catch(() => {});
  }
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

// ─── AGENDAMENTO ─────────────────────────────────────────────────────────────
async function agendar() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    alert("Você precisa estar logado!");
    return window.location.href = "login.html";
  }

  const data    = document.getElementById("data")?.value;
  const horario = document.getElementById("horario")?.value;

  if (!data || !horario) return alert("Selecione data e horário!");

  try {
    const res    = await fetch(`${API}/agendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, data, horario })
    });
    const result = await res.json();

    if (res.ok) {
      alert("Agendamento realizado com sucesso!");
      carregarAgendamentos();
    } else {
      alert(result.erro || "Erro ao agendar.");
    }
  } catch (err) {
    alert("Erro ao conectar com o servidor.");
  }
}

// ─── HORÁRIOS OCUPADOS ────────────────────────────────────────────────────────
async function carregarAgendamentos() {
  const data  = document.getElementById("data")?.value;
  const lista = document.getElementById("lista-agendamentos");
  if (!data || !lista) return;

  try {
    const res  = await fetch(`${API}/agendamentos?data=${data}`);
    const rows = await res.json();

    if (rows.length === 0) {
      lista.innerHTML = "<p style='color:#bdbdbd'>Nenhum horário ocupado nesta data.</p>";
      return;
    }

    lista.innerHTML = rows.map(r => `
      <div class="agendamento">
        <h3>⏰ ${r.horario}</h3>
        <span class="status">Ocupado</span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Erro ao carregar agendamentos:", err);
  }
}

// ─── BUSCA PARCIAL — USUÁRIOS ─────────────────────────────────────────────────
async function buscarUsuarios() {
  const q         = document.getElementById("busca-usuario")?.value.trim();
  const resultado = document.getElementById("resultado-busca");
  if (!q || !resultado) return;

  try {
    const res   = await fetch(`${API}/buscar/usuarios?q=${encodeURIComponent(q)}`);
    const users = await res.json();

    if (!res.ok || users.length === 0) {
      resultado.innerHTML = "<p style='color:#bdbdbd'>Nenhum usuário encontrado.</p>";
      return;
    }

    resultado.innerHTML = users.map(u => `
      <div class="agendamento">
        <h3>${u.nome}</h3>
        <p>${u.email}</p>
      </div>
    `).join("");
  } catch (err) {
    console.error("Erro na busca:", err);
  }
}

// ─── MOSTRAR NOME DO USUÁRIO LOGADO ──────────────────────────────────────────
function mostrarUsuario() {
  const user    = JSON.parse(localStorage.getItem("user"));
  const perfilEl = document.getElementById("perfil-nome");
  if (perfilEl && user) perfilEl.textContent = `👤 Olá, ${user.nome}`;
}

mostrarUsuario();