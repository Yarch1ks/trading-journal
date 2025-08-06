/**
 * Supabase Auth integration for GitHub Pages static site.
 * Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY (defined in HTML).
 * Provides:
 *  - signUp({ email, password, nickname })
 *  - signIn({ email, password })
 *  - signOut()
 *  - getUser()
 * Also wires up forms on auth.html if present.
 */

(function () {
  // Ensure SDK loaded
  if (!window.supabase) {
    console.error("Supabase SDK not loaded");
    return;
  }
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error("Supabase credentials are missing");
    return;
  }

  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Генерация email из никнейма по правилу: nickname@example.com (валидный домен)
  const EMAIL_SUFFIX = "example.com";
  function emailFromNickname(nicknameRaw) {
    const nickname = String(nicknameRaw || "").trim().toLowerCase();
    if (!nickname) throw new Error("Введите никнейм");
    // Дополнительно можно отфильтровать недопустимые символы для псевдо-домена
    const sanitized = nickname.replace(/[^a-z0-9._-]/g, "");
    if (!sanitized) throw new Error("Неверный никнейм");
    return `${sanitized}@${EMAIL_SUFFIX}`;
  }

  async function ensureProfile(userId, nickname) {
    // Insert profile if not exists; handle unique nickname
    // First, check nickname uniqueness
    const { data: taken, error: checkErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("nickname", nickname)
      .limit(1)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (taken) {
      // If the nickname exists but belongs to the same user (unlikely during sign-up), allow
      if (taken.id !== userId) {
        throw new Error("Никнейм уже занят");
      }
    }

    // Insert profile row if not present
    const { data: existing, error: existErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      const { error: insertErr } = await supabase.from("profiles").insert({ id: userId, nickname });
      if (insertErr) throw insertErr;
    }
  }

  async function signUp({ nickname, password }) {
    const email = emailFromNickname(nickname);
    // Create auth user with metadata
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname }
      }
    });
    if (signUpErr) throw signUpErr;

    // If email confirmation is ON, user may be null until confirmed.
    if (signUpData.user) {
      await ensureProfile(signUpData.user.id, nickname);
    }

    return signUpData;
  }

  async function signIn({ nickname, password }) {
    const email = emailFromNickname(nickname);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  // Expose API
  window.auth = { supabase, signUp, signIn, signOut, getUser };

  // Wire up forms if present (auth.html)
  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");

    if (signupForm) {
      signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(signupForm);
        const nickname = String(fd.get("nickname") || "").trim();
        const password = String(fd.get("password") || "");
        const msg = document.getElementById("signup-msg");
        if (msg) msg.className = "msg";
        if (msg) msg.textContent = "Регистрация...";

        try {
          if (!nickname) throw new Error("Введите никнейм");
          await signUp({ nickname, password });
          if (msg) {
            msg.className = "msg ok";
            msg.textContent = "Успешно! Теперь войдите под никнеймом и паролем.";
          }
        } catch (err) {
          if (msg) {
            msg.className = "msg err";
            msg.textContent = "Ошибка: " + (err?.message || String(err));
          }
        }
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(loginForm);
        const nickname = String(fd.get("nickname") || "").trim();
        const password = String(fd.get("password") || "");
        const msg = document.getElementById("login-msg");
        if (msg) msg.className = "msg";
        if (msg) msg.textContent = "Вход...";

        try {
          if (!nickname) throw new Error("Введите никнейм");
          await signIn({ nickname, password });
          if (msg) {
            msg.className = "msg ok";
            msg.textContent = "Вход выполнен. Переход к журналу...";
          }
          // Redirect to journal
          window.location.href = "./journal.html";
        } catch (err) {
          if (msg) {
            msg.className = "msg err";
            msg.textContent = "Ошибка: " + (err?.message || String(err));
          }
        }
      });
    }
  });
})();
