const params = new URLSearchParams(window.location.search);
const token = params.get("token");
const form = document.getElementById("resetPasswordForm");
const submit = document.getElementById("submit");
const passwordEl = document.getElementById("password");
const result = document.getElementById("result");
let toastTimer = null;

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
