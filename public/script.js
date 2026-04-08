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

    // Helper: Global 401 Session Intercept
    const checkUnauthorized = (res) => {
        if (res.status === 401) {
            localStorage.removeItem("token");
            alert("Session expired. Please log in again.");
            window.location.href = "login.html";
            return true;
        }
        return false;
    };

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
            const btn = document.getElementById("authSubmitBtn");

            btn.disabled = true;
            btn.innerHTML = "Logging in...";
            errorText.innerHTML = "";

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
            } finally {
                btn.disabled = false;
                btn.innerHTML = "Login";
            }
        });
    }

    // Signup Form
    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("name").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const errorText = document.getElementById("error");
            const btn = document.getElementById("authSubmitBtn");

            if (!name || !email || !password) {
                errorText.innerHTML = "⚠️ All fields are required.";
                return;
            }

            btn.disabled = true;
            btn.innerHTML = "Creating account...";
            errorText.innerHTML = "";

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
            } finally {
                btn.disabled = false;
                btn.innerHTML = "Sign Up";
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

            const userPrompt = promptInput.value.trim();
            
            if (!userPrompt) {
                errorText.innerHTML = "⚠️ Please enter a prompt.";
                return;
            }
            if (userPrompt.length > 250) {
                errorText.innerHTML = "⚠️ Prompt is too long (Max 250 chars).";
                return;
            }

            loading.style.display = "block";
            button.disabled = true;
            
            responseContainer.classList.add("hidden");
            errorText.innerHTML = "";
            promptInput.value = "";

            // Set up a 15-second frontend timeout as a safety net
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({ prompt: userPrompt }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const data = await res.json();

                if (checkUnauthorized(res)) return;

                if (!res.ok) {
                    throw new Error(data.error || data.details || "API Connection Failed. Please try again later.");
                }

                if (!data.response) {
                    throw new Error("Received an invalid response from the server.");
                }

                responseText.innerHTML = data.response.replace(/\n/g, '<br>');
                responseContainer.classList.remove("hidden");

            } catch (err) {
                if (err.name === 'AbortError') {
                    errorText.innerHTML = "⚠️ Request timed out. The server took too long to respond.";
                } else {
                    errorText.innerHTML = `⚠️ ${err.message}`;
                }
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
    const habitErrorText = document.getElementById("habitError"); // Fallback check if undefined

    if (appContainer && token && addHabitForm && habitsList) {
        // Fetch habits on load
        const fetchHabits = async () => {
            try {
                const res = await fetch("/api/habits", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error("Failed to load habits");
                const habits = await res.json();
                renderHabits(habits);
            } catch (err) {
                console.error(err);
                if (habitErrorText) habitErrorText.innerHTML = "⚠️ Failed to fetch habits.";
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
                        <button class="status-btn" onclick="toggleHabit('${habit._id}', '${habit.status}', this)" title="Mark as ${habit.status === 'completed' ? 'Pending' : 'Completed'}">
                            ${habit.status === 'completed' ? '↩️' : '✅'}
                        </button>
                        <button class="delete-btn" onclick="deleteHabit('${habit._id}', this)" title="Delete">
                            🗑️
                        </button>
                    </div>
                `;
                habitsList.appendChild(card);
            });
        };

        // Global function: Toggle Habit Status
        window.toggleHabit = async (id, currentStatus, btnElement) => {
            const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
            const originalHTML = btnElement.innerHTML;
            btnElement.disabled = true;
            btnElement.innerHTML = "⏳";
            
            try {
                const res = await fetch(`/api/habits/${id}`, {
                    method: "PUT",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({ status: newStatus })
                });
                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error("Could not update");
                fetchHabits();
            } catch (err) {
                if(habitErrorText) habitErrorText.innerHTML = "⚠️ Server error modifying habit.";
                btnElement.disabled = false;
                btnElement.innerHTML = originalHTML;
            }
        };

        // Global function: Delete Habit
        window.deleteHabit = async (id, btnElement) => {
            if (!confirm("Are you sure you want to delete this habit?")) return;
            const originalHTML = btnElement.innerHTML;
            btnElement.disabled = true;
            btnElement.innerHTML = "⏳";
            
            try {
                const res = await fetch(`/api/habits/${id}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error("Could not delete");
                fetchHabits();
            } catch (err) {
                if(habitErrorText) habitErrorText.innerHTML = "⚠️ Server error deleting habit.";
                btnElement.disabled = false;
                btnElement.innerHTML = originalHTML;
            }
        };

        // Add Habit Form
        addHabitForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("habitTitle");
            const descInput = document.getElementById("habitDesc");
            const titleVal = titleInput.value.trim();
            const descVal = descInput.value.trim();
            const addBtn = document.getElementById("addHabitBtn");
            const errorElement = document.getElementById("habitError") || { innerHTML: "" };

            errorElement.innerHTML = "";
            
            // Empty and Length Validation
            if (!titleVal) {
                errorElement.innerHTML = "⚠️ Habit title cannot be empty.";
                return;
            }
            if (titleVal.length > 100) {
                errorElement.innerHTML = "⚠️ Title exceeds maximum 100 characters.";
                return;
            }
            if (descVal.length > 250) {
                errorElement.innerHTML = "⚠️ Description exceeds maximum 250 characters.";
                return;
            }

            addBtn.disabled = true;
            addBtn.innerText = "Adding...";

            try {
                const res = await fetch("/api/habits", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify({
                        title: titleVal,
                        description: descVal
                    })
                });
                
                if (checkUnauthorized(res)) return;

                if (res.ok) {
                    titleInput.value = "";
                    descInput.value = "";
                    fetchHabits();
                } else {
                    const data = await res.json();
                    errorElement.innerHTML = `⚠️ ${data.error || "Failed to add habit"}`;
                }
            } catch (err) {
                errorElement.innerHTML = "⚠️ Connection error. Please try again.";
            } finally {
                addBtn.disabled = false;
                addBtn.innerText = "Add";
            }
        });

        // Initial fetch
        fetchHabits();
    }
});