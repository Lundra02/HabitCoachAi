document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const path = window.location.pathname;

    // Session Protection
    const isAuthPage = path.includes("login.html") || path.includes("signup.html");
    if (!token && !isAuthPage && (path === "/" || path.includes("index.html"))) {
        window.location.href = "login.html";
        return;
    }
    if (token && isAuthPage) {
        window.location.href = "index.html";
        return;
    }

    // Show App Container (Index Dashboard)
    const appContainer = document.getElementById("app-container");
    if (appContainer && token) {
        appContainer.classList.remove("hidden");
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userNameDisplay = document.getElementById("userNameDisplay");
            if (userNameDisplay) {
                if (payload.name) {
                    userNameDisplay.innerText = payload.name;
                } else if (payload.email) {
                    userNameDisplay.innerText = payload.email.split('@')[0];
                }
            }
        } catch (e) {
            console.log("Could not parse JWT token body", e);
        }
    }

    // Logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("token");
            window.location.href = "login.html";
        });
    }

    // Login Form
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const errorText = document.getElementById("error");

            try {
                const res = await fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || "Login failed");

                localStorage.setItem("token", data.token);
                window.location.href = "index.html";
            } catch (err) {
                errorText.innerHTML = `⚠️ ${err.message}`;
            }
        });
    }

    // Signup Form
    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("name").value;
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const errorText = document.getElementById("error");

            try {
                const res = await fetch("/api/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || "Signup failed");

                localStorage.setItem("token", data.token);
                window.location.href = "index.html";
            } catch (err) {
                errorText.innerHTML = `⚠️ ${err.message}`;
            }
        });
    }

    // Main AI Form (index.html)
    const form = document.getElementById("aiForm");
    if (form) {
        const promptInput = document.getElementById("prompt");
        const loading = document.getElementById("loading");
        const responseText = document.getElementById("response");
        const responseContainer = document.getElementById("response-container");
        const errorText = document.getElementById("error");
        const button = document.getElementById("submitBtn");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const userPrompt = promptInput.value;
            loading.style.display = "block";
            button.disabled = true;
            
            responseContainer.classList.add("hidden");
            errorText.innerHTML = "";
            promptInput.value = "";

            try {
                const res = await fetch("/ask", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({ prompt: userPrompt })
                });

                const data = await res.json();

                if (res.status === 401) {
                    localStorage.removeItem("token");
                    window.location.href = "login.html";
                    return;
                }

                if (!res.ok) {
                    if (res.status === 429 || data.details?.includes("429")) {
                        throw new Error("Google is limiting requests. Please wait 1 minute.");
                    }
                    throw new Error(data.details || "API Connection Failed");
                }

                responseText.innerHTML = data.response.replace(/\n/g, '<br>');
                responseContainer.classList.remove("hidden");

            } catch (err) {
                errorText.innerHTML = `⚠️ ${err.message}`;
            } finally {
                loading.style.display = "none";
                button.disabled = false;
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        });
    }
});