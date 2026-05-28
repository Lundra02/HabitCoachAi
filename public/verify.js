const params = new URLSearchParams(window.location.search);
const email = params.get("email") || sessionStorage.getItem("pendingVerificationEmail") || "";
const storedExpiry = sessionStorage.getItem("pendingVerificationExpires");
const inputs = Array.from(document.querySelectorAll(".code-input"));
const form = document.getElementById("verifyForm");
const emailLabel = document.getElementById("verifyEmailLabel");
const messageEl = document.getElementById("verifyMessage");
const submitBtn = document.getElementById("verifySubmitBtn");
const resendBtn = document.getElementById("resendCodeBtn");
const countdownEl = document.getElementById("verifyCountdown");

let expiresAt = storedExpiry ? new Date(storedExpiry).getTime() : Date.now() + 10 * 60 * 1000;
if (Number.isNaN(expiresAt)) {
    expiresAt = Date.now() + 10 * 60 * 1000;
}
let toastTimer = null;

if (!email && localStorage.getItem("token")) {
    window.location.href = "index.html";
}

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

const setMessage = (message = "", isError = false) => {
    messageEl.textContent = message;
    messageEl.classList.toggle("error", isError);
};

const getCode = () => inputs.map((input) => input.value).join("");

const setLoading = (isLoading, label = "Verify email") => {
    submitBtn.disabled = isLoading;
    resendBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Verifying..." : label;
};

const syncCountdown = () => {
    const remainingMs = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    countdownEl.textContent = remainingMs > 0
        ? `Code expires in ${minutes}:${String(seconds).padStart(2, "0")}`
        : "Code expired";
    countdownEl.classList.toggle("expired", remainingMs <= 0);
};

if (!email) {
    setMessage("Missing email. Please sign up or log in again.", true);
    form.querySelectorAll("input, button").forEach((el) => {
        el.disabled = true;
    });
} else {
    emailLabel.textContent = email;
    sessionStorage.setItem("pendingVerificationEmail", email);
    inputs[0]?.focus();
}

inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 1);
        if (input.value && inputs[index + 1]) {
            inputs[index + 1].focus();
        }
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && inputs[index - 1]) {
            inputs[index - 1].focus();
        }
    });

    input.addEventListener("paste", (event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        pasted.split("").forEach((digit, digitIndex) => {
            if (inputs[digitIndex]) inputs[digitIndex].value = digit;
        });
        inputs[Math.min(pasted.length, inputs.length) - 1]?.focus();
    });
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = getCode();

    if (!/^\d{6}$/.test(code)) {
        setMessage("Enter all 6 digits from your email.", true);
        showToast("Enter the full 6-digit code.", "error");
        return;
    }

    setLoading(true);
    setMessage("");

    try {
        const res = await fetch("/api/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed.");

        if (data.user?.token) {
            localStorage.setItem("token", data.user.token);
        }
        sessionStorage.removeItem("pendingVerificationEmail");
        sessionStorage.removeItem("pendingVerificationExpires");
        showToast("Email verified. Opening your dashboard...");
        setMessage("Email verified. Redirecting to your dashboard...");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 900);
    } catch (error) {
        setMessage(error.message, true);
        showToast(error.message, "error");
    } finally {
        setLoading(false);
    }
});

resendBtn.addEventListener("click", async () => {
    if (!email) return;

    resendBtn.disabled = true;
    const originalText = resendBtn.textContent;
    resendBtn.textContent = "Sending...";
    setMessage("");

    try {
        const res = await fetch("/api/resend-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not resend code.");

        if (data.alreadyVerified) {
            showToast("This email is already verified.");
            setTimeout(() => {
                window.location.href = "login.html";
            }, 900);
            return;
        }

        expiresAt = data.verificationCodeExpires ? new Date(data.verificationCodeExpires).getTime() : Date.now() + 10 * 60 * 1000;
        if (data.verificationCodeExpires) {
            sessionStorage.setItem("pendingVerificationExpires", data.verificationCodeExpires);
        }
        inputs.forEach((input) => {
            input.value = "";
        });
        inputs[0]?.focus();
        syncCountdown();
        showToast(data.message || "A new code was sent.");
    } catch (error) {
        setMessage(error.message, true);
        showToast(error.message, "error");
    } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = originalText;
    }
});

syncCountdown();
setInterval(syncCountdown, 1000);
