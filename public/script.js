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

    // --- HABITS Logic ---
    const addHabitForm = document.getElementById("addHabitForm");
    const habitsList = document.getElementById("habitsList");

    if (appContainer && token && addHabitForm && habitsList) {
        // Fetch habits on load
        const fetchHabits = async () => {
            try {
                const res = await fetch("/api/habits", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (!res.ok) throw new Error("Failed to load habits");
                const habits = await res.json();
                renderHabits(habits);
            } catch (err) {
                console.error(err);
            }
        };

        const renderHabits = (habits) => {
            habitsList.innerHTML = "";
            if (habits.length === 0) {
                habitsList.innerHTML = "<p style='color: var(--text-sub); font-size: 0.95rem; text-align: center;'>No habits added yet. Start tracking today!</p>";
                return;
            }
            
            habits.forEach(habit => {
                const card = document.createElement("div");
                card.className = `habit-card ${habit.status === 'completed' ? 'completed' : ''}`;
                
                const safeTitle = habit.title.replace(/</g, "&lt;");
                const safeDesc = habit.description ? habit.description.replace(/</g, "&lt;") : '';
                
                card.innerHTML = `
                    <div class="habit-info">
                        <h3>${safeTitle}</h3>
                        ${safeDesc ? `<p>${safeDesc}</p>` : ''}
                    </div>
                    <div class="habit-actions">
                        <button class="status-btn" onclick="toggleHabit('${habit._id}', '${habit.status}')" title="Mark as ${habit.status === 'completed' ? 'Pending' : 'Completed'}">
                            ${habit.status === 'completed' ? '↩️' : '✅'}
                        </button>
                        <button class="delete-btn" onclick="deleteHabit('${habit._id}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                `;
                habitsList.appendChild(card);
            });
        };

        // Make global functions for inline onclick handlers
        window.toggleHabit = async (id, currentStatus) => {
            const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
            try {
                const res = await fetch(`/api/habits/${id}`, {
                    method: "PUT",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({ status: newStatus })
                });
                if (res.ok) fetchHabits();
            } catch (err) {
                console.error(err);
            }
        };

        window.deleteHabit = async (id) => {
            if (!confirm("Are you sure you want to delete this habit?")) return;
            try {
                const res = await fetch(`/api/habits/${id}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) fetchHabits();
            } catch (err) {
                console.error(err);
            }
        };

        // Add Habit
        addHabitForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("habitTitle");
            const descInput = document.getElementById("habitDesc");
            
            try {
                const res = await fetch("/api/habits", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({
                        title: titleInput.value,
                        description: descInput.value
                    })
                });
                
                if (res.ok) {
                    titleInput.value = "";
                    descInput.value = "";
                    fetchHabits();
                } else {
                    const data = await res.json();
                    alert(data.error || "Failed to add habit");
                }
            } catch (err) {
                console.error(err);
            }
        });

        // Initial fetch
        fetchHabits();
    }
});