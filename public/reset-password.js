const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const queryParams = new URLSearchParams(window.location.search);
const token = hashParams.get("token") || queryParams.get("token");
const form = document.getElementById("resetPasswordForm");
const submit = document.getElementById("submit");
const passwordEl = document.getElementById("password");
const result = document.getElementById("result");
let toastTimer = null;

const attachPasswordToggles = (root = document) => {
  root.querySelectorAll("input[type='password']").forEach((input) => {
    if (input.dataset.toggleAttached === "true") return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle-btn";
    toggle.textContent = "Show";
    toggle.setAttribute("aria-label", "Show password");
    wrapper.appendChild(toggle);

    toggle.addEventListener("click", () => {
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      toggle.textContent = shouldShow ? "Hide" : "Show";
      toggle.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    });

    input.dataset.toggleAttached = "true";
  });
};

attachPasswordToggles();

const showToast = (message = "", type = "success") => {
  if (!message) return;
  const toast = document.getElementById("appToast");
  if (!toast) return;

  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error");
  toast.style.animation = "none";
  void toast.offsetWidth;
  toast.style.animation = "";
  toast.classList.add(type === "error" ? "error" : "success");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4200);
};

const setResult = (message = "", isError = false) => {
  result.textContent = message;
  result.classList.toggle("error", isError);
};

const setLoading = (isLoading) => {
  submit.disabled = isLoading;
  passwordEl.disabled = isLoading;
  submit.textContent = isLoading ? "Resetting..." : "Reset password";
};

if (!token) {
  setResult("Missing reset token. Please request a new password reset email.", true);
  showToast("Missing reset token.", "error");
  submit.disabled = true;
  passwordEl.disabled = true;
} else {
  if (window.location.search) {
    window.history.replaceState(null, "", `${window.location.pathname}#token=${encodeURIComponent(token)}`);
  }
  passwordEl.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordEl.value.trim();

  if (password.length < 6) {
    setResult("Password must be at least 6 characters.", true);
    showToast("Password must be at least 6 characters.", "error");
    passwordEl.focus();
    return;
  }

  setLoading(true);
  setResult("");

  try {
    const res = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Reset failed.");

    setResult(data.message || "Password reset successful. Redirecting to login...");
    showToast("Password reset successful.");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);
  } catch (err) {
    setResult(err.message, true);
    showToast(err.message, "error");
  } finally {
    setLoading(false);
  }
});
