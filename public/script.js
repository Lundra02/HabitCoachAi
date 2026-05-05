document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const path = window.location.pathname;
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    let refreshHabits = null;
    let completionPieChart = null;
    let trendChart = null;
    let activePeriod = "week";
    let allHabits = [];
    let renderHabits = () => {};
    // Planning-only UI state: habits hidden from Time Blocking (not deleted from DB).
    const hiddenFromTimeBlocking = new Set();
    const getDateKey = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };
    const getTodayDate = () => getDateKey(new Date());
    // Global date state used by all habit rendering (Dashboard + Planning).
    let selectedDate = getTodayDate();

    const isAuthPage = path.includes("login.html") || path.includes("signup.html");
    if (!token && !isAuthPage && (path === "/" || path.includes("index.html"))) {
        window.location.href = "login.html";
        return;
    }
    if (token && isAuthPage) {
        window.location.href = "index.html";
        return;
    }

    const checkUnauthorized = (res) => {
        if (res.status === 401) {
            localStorage.removeItem("token");
            alert("Session expired. Please log in again.");
            window.location.href = "login.html";
            return true;
        }
        return false;
    };

    const authHeaders = (withJson = false) => {
        const headers = {
            "Authorization": `Bearer ${token}`,
            "X-User-Timezone": userTimeZone
        };
        if (withJson) headers["Content-Type"] = "application/json";
        return headers;
    };

    const appContainer = document.getElementById("app-container");
    if (appContainer && token) {
        appContainer.classList.remove("hidden");
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            const userNameDisplay = document.getElementById("userNameDisplay");
            if (userNameDisplay) {
                userNameDisplay.innerText = payload.name || (payload.email ? payload.email.split("@")[0] : "User");
            }
        } catch (error) {
            console.log("Could not parse JWT token body", error);
        }
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("token");
            window.location.href = "login.html";
        });
    }

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const errorText = document.getElementById("error");
            const btn = document.getElementById("authSubmitBtn");

            btn.disabled = true;
            btn.textContent = "Logging in...";
            errorText.textContent = "";

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
                errorText.textContent = `Warning: ${err.message}`;
            } finally {
                btn.disabled = false;
                btn.textContent = "Login";
            }
        });
    }

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
                errorText.textContent = "Warning: All fields are required.";
                return;
            }

            btn.disabled = true;
            btn.textContent = "Creating account...";
            errorText.textContent = "";

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
                errorText.textContent = `Warning: ${err.message}`;
            } finally {
                btn.disabled = false;
                btn.textContent = "Sign Up";
            }
        });
    }

    // Sidebar navigation and views
    const navItems = document.querySelectorAll(".nav-item[data-view]");
    const views = {
        dashboard: document.getElementById("dashboardView"),
        planning: document.getElementById("planning-section"),
        progress: document.getElementById("progressView"),
        settings: document.getElementById("settingsView")
    };
    const weeklyArchitectGrid = document.getElementById("weeklyArchitectGrid");
    const yearlyProgressLabel = document.getElementById("yearlyProgressLabel");
    const yearlyProgressFill = document.getElementById("yearlyProgressFill");
    const quarterlyBreakdown = document.getElementById("quarterlyBreakdown");
    const yearlyPaceSummary = document.getElementById("yearlyPaceSummary");
    const timeBlockingView = document.getElementById("timeBlockingView");
    const planningSection = document.getElementById("planning-section");
    const planningEditModal = document.getElementById("planningEditModal");
    const planningModalClose = document.getElementById("planningModalClose");
    const planningModalCancel = document.getElementById("planningModalCancel");
    const planningModalSave = document.getElementById("planningModalSave");
    const planningModalError = document.getElementById("planningModalError");
    const planningHabitTitle = document.getElementById("planningHabitTitle");
    const planningTimeOfDaySelect = document.getElementById("planningTimeOfDaySelect");
    const planningFrequencyChecks = document.getElementById("planningFrequencyChecks");
    const datePicker = document.getElementById("datePicker");
    const viewingDate = document.getElementById("viewingDate");
    const backToToday = document.getElementById("backToToday");
    const historyModeLabel = document.getElementById("historyModeLabel");
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const timeBuckets = ["Morning", "Afternoon", "Evening"];
    let selectedPlanningHabitId = "";

    const escapeHtml = (value = "") =>
        String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const stripRawIdNoise = (value = "") => String(value).replace(/\b\d{7,}\b/g, " ").replace(/\s+/g, " ").trim();
    const formatHabitTitle = (title = "") => stripRawIdNoise(title) || "Untitled Habit";

    const normalizeFrequency = (frequency) => {
        if (!Array.isArray(frequency) || frequency.length === 0) return [0, 1, 2, 3, 4, 5, 6];
        const days = [...new Set(frequency.map((day) => Number(day)))].filter((day) =>
            Number.isInteger(day) && day >= 0 && day <= 6
        );
        return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
    };

    const isHabitScheduledForDay = (habit, dayIndex) => normalizeFrequency(habit.frequency).includes(dayIndex);
    const getDayIndexFromDate = (dateKey) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? new Date().getDay() : parsed.getDay();
    };
    const isViewingToday = () => selectedDate === getTodayDate();

    // Date-key lookup against persisted history entries (YYYY-MM-DD).
    const getHabitHistoryRecord = (habit, dateKey) => {
        const history = Array.isArray(habit?.history) ? habit.history : [];
        return history.find((entry) => entry?.date === dateKey) || null;
    };

    const getHabitDisplayState = (habit, dateKey = selectedDate) => {
        const record = getHabitHistoryRecord(habit, dateKey);
        const displayStatus = record?.status || "pending";
        // Any non-today view is read-only to prevent historical edits.
        const readOnlyMode = dateKey !== getTodayDate();
        const isLocked = Boolean(record?.locked) || displayStatus === "missed" || readOnlyMode;
        const statusLabel = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
        const resolvedDate = record?.date || dateKey;
        return { displayStatus, isLocked, statusLabel, dateKey: resolvedDate, readOnlyMode };
    };

    const formatViewingDate = (dateKey) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return dateKey;
        return parsed.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    };

    const syncDateNavigationUI = () => {
        if (datePicker) datePicker.value = selectedDate;
        if (viewingDate) viewingDate.textContent = `Viewing: ${formatViewingDate(selectedDate)}`;
        if (backToToday) backToToday.disabled = isViewingToday();
        if (historyModeLabel) {
            if (isViewingToday()) {
                historyModeLabel.textContent = "";
                historyModeLabel.classList.add("hidden");
            } else {
                historyModeLabel.textContent = "Viewing History (Read-only)";
                historyModeLabel.classList.remove("hidden");
            }
        }
    };

    const getCurrentDayOfYear = () => {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const diff = now - startOfYear;
        return Math.floor(diff / 86400000) + 1;
    };

    const getYearlyCompletedCount = (habits) => {
        const yearPrefix = `${new Date().getFullYear()}-`;
        return habits.reduce((sum, habit) => {
            const history = Array.isArray(habit.history) ? habit.history : [];
            const completedCount = history.filter((item) => item?.date?.startsWith(yearPrefix) && item.status === "completed").length;
            return sum + completedCount;
        }, 0);
    };

    const renderQuarterlyBreakdown = (currentDay) => {
        if (!quarterlyBreakdown) return;
        const quarters = [
            { label: "Q1", start: 1, end: 91 },
            { label: "Q2", start: 92, end: 181 },
            { label: "Q3", start: 182, end: 273 },
            { label: "Q4", start: 274, end: 365 }
        ];

        quarterlyBreakdown.innerHTML = quarters
            .map((quarter) => {
                const total = quarter.end - quarter.start + 1;
                const coveredDays = Math.min(Math.max(currentDay - quarter.start + 1, 0), total);
                const percent = Math.round((coveredDays / total) * 100);

                return `
                    <div class="quarter-item">
                        <div class="quarter-head">
                            <span>${quarter.label}</span>
                            <strong>${percent}%</strong>
                        </div>
                        <div class="quarter-track">
                            <span class="quarter-fill" style="width:${percent}%"></span>
                        </div>
                    </div>
                `;
            })
            .join("");
    };

    const renderYearlyProgress = (habits) => {
        if (!yearlyProgressFill || !yearlyProgressLabel) return;
        const currentDay = getCurrentDayOfYear();
        const progressPct = Math.min(100, Math.max(0, (currentDay / 365) * 100));
        const completedSoFar = getYearlyCompletedCount(habits);
        const projectedCompleted = Math.round((completedSoFar / Math.max(currentDay, 1)) * 365);

        yearlyProgressFill.style.width = `${progressPct}%`;
        yearlyProgressLabel.textContent = `Day ${currentDay} of 365 (${progressPct.toFixed(1)}%)`;
        renderQuarterlyBreakdown(currentDay);
        if (yearlyPaceSummary) {
            yearlyPaceSummary.textContent = `At your current pace, you will finish the year with ${projectedCompleted} completed habits.`;
        }
    };

    const renderHabitBadge = (habit) => {
        const cleanTitle = escapeHtml(formatHabitTitle(habit.title));
        const cleanTime = escapeHtml(habit.timeOfDay || "Morning");
        return `
            <button type="button" class="habit-badge" data-habit-id="${habit._id}" title="Edit plan">
                <span>${cleanTitle}</span>
                <small>${cleanTime}</small>
            </button>
        `;
    };

    const renderTimeBlockHabitCard = (habit) => {
        const safeTitle = escapeHtml(formatHabitTitle(habit.title));
        const safeDesc = habit.description ? escapeHtml(habit.description) : "";
        const { displayStatus, isLocked, statusLabel, dateKey, readOnlyMode } = getHabitDisplayState(habit, selectedDate);
        const isCompleted = displayStatus === "completed";
        const actionType = isCompleted ? "undo" : "complete";
        const actionLabel = isCompleted ? "Undo to pending" : "Mark as completed";
        const actionSymbol = isCompleted ? "&#8634;" : "&#10003;";
        const nextStatus = isCompleted ? "pending" : "completed";

        return `
            <div class="habit-card ${isCompleted ? "completed" : ""} ${displayStatus === "missed" ? "missed" : ""}" style="${readOnlyMode ? "opacity:0.72;filter:grayscale(0.15);" : ""}">
                <div class="habit-info">
                    <h3>${safeTitle} <span class="status-badge status-${displayStatus}">${statusLabel}</span></h3>
                    ${safeDesc ? `<p>${safeDesc}</p>` : ""}
                    ${readOnlyMode
                        ? `<p class="deadline-text">Viewing history for ${escapeHtml(formatViewingDate(selectedDate))}. Status updates are disabled.</p>`
                        : (isLocked ? `<p class="deadline-text">Today's deadline passed.</p>` : "")}
                </div>
                <div class="habit-actions">
                    <button
                        type="button"
                        class="status-btn"
                        title="${actionLabel}"
                        data-planning-action="${actionType}"
                        data-habit-id="${habit._id}"
                        data-next-status="${nextStatus}"
                        data-date="${dateKey}"
                        ${isLocked ? "disabled" : ""}
                    >${actionSymbol}</button>
                    <button
                        type="button"
                        class="delete-btn"
                        title="Remove from Time Blocking"
                        data-planning-action="delete"
                        data-habit-id="${habit._id}"
                    >&#128465;</button>
                </div>
            </div>
        `;
    };

    const renderWeeklyArchitect = (habits) => {
        if (!weeklyArchitectGrid) return;
        const todayIndex = getDayIndexFromDate(getTodayDate());
        const previousDayIndex = (todayIndex + 6) % 7;
        const nextDayIndex = (todayIndex + 1) % 7;

        // Keep yesterday, today, tomorrow first. Remaining days stay accessible by scroll.
        const orderedDayIndexes = [
            previousDayIndex,
            todayIndex,
            nextDayIndex,
            ...dayNames
                .map((_, index) => index)
                .filter((index) => ![previousDayIndex, todayIndex, nextDayIndex].includes(index))
        ];

        weeklyArchitectGrid.style.maxHeight = "560px";
        weeklyArchitectGrid.style.overflowY = "auto";
        weeklyArchitectGrid.style.paddingRight = "6px";

        weeklyArchitectGrid.innerHTML = orderedDayIndexes
            .map((dayIndex) => {
                const dayName = dayNames[dayIndex];
                const scheduledHabits = habits.filter((habit) => isHabitScheduledForDay(habit, dayIndex));
                const itemsHtml = scheduledHabits.length
                    ? scheduledHabits
                        .map((habit) => renderHabitBadge(habit))
                        .join("")
                    : "<p class=\"empty\">No habits</p>";
                const isScrollable = scheduledHabits.length > 5;
                const relationLabel = dayIndex === previousDayIndex
                    ? "Yesterday"
                    : dayIndex === todayIndex
                        ? "Today"
                        : dayIndex === nextDayIndex
                            ? "Tomorrow"
                            : "";

                return `
                    <div class="weekly-day-card ${dayIndex === todayIndex ? "today" : ""}">
                        <div class="weekly-day-head">
                            <div>
                                <p class="weekly-day-name">${dayName}</p>
                                <p class="weekly-day-count">${scheduledHabits.length} habits</p>
                            </div>
                            ${relationLabel ? `<span class="today-pill">${relationLabel}</span>` : ""}
                        </div>
                        <div class="weekly-day-badges ${isScrollable ? "scrollable" : ""}">${itemsHtml}</div>
                    </div>
                `;
            })
            .join("");
    };

    const renderTimeBlocking = (habits) => {
        if (!timeBlockingView) return;

        const groups = {
            Morning: [],
            Afternoon: [],
            Evening: []
        };

        habits.forEach((habit) => {
            if (hiddenFromTimeBlocking.has(habit._id)) return;
            const block = timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning";
            groups[block].push(habit);
        });

        timeBlockingView.innerHTML = timeBuckets
            .map((block) => {
                const blockHabits = groups[block];
                const itemsHtml = blockHabits.length
                    ? blockHabits
                        .map((habit) => renderTimeBlockHabitCard(habit))
                        .join("")
                    : "<p class=\"empty\">No habits assigned</p>";

                return `
                    <div class="time-block-card">
                        <p class="time-block-title">${block}</p>
                        <div class="time-block-list">${itemsHtml}</div>
                    </div>
                `;
            })
            .join("");
    };

    const renderFrequencyChecks = (selectedFrequency) => {
        if (!planningFrequencyChecks) return;
        planningFrequencyChecks.innerHTML = dayNames
            .map((dayName, dayIndex) => `
                <label class="frequency-check">
                    <input type="checkbox" value="${dayIndex}" ${selectedFrequency.includes(dayIndex) ? "checked" : ""} />
                    <span>${dayName.slice(0, 3)}</span>
                </label>
            `)
            .join("");
    };

    const openPlanningModal = (habitId) => {
        const habit = allHabits.find((item) => item._id === habitId);
        if (!habit || !planningEditModal || !planningTimeOfDaySelect) return;

        selectedPlanningHabitId = habitId;
        planningHabitTitle.textContent = formatHabitTitle(habit.title);
        planningTimeOfDaySelect.value = timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning";
        renderFrequencyChecks(normalizeFrequency(habit.frequency));
        if (planningModalError) planningModalError.textContent = "";
        planningEditModal.classList.remove("hidden");
    };

    const closePlanningModal = () => {
        if (!planningEditModal) return;
        planningEditModal.classList.add("hidden");
        selectedPlanningHabitId = "";
        if (planningModalError) planningModalError.textContent = "";
    };

    const savePlanningChanges = async () => {
        if (!selectedPlanningHabitId || !planningTimeOfDaySelect || !planningFrequencyChecks) return;
        const selectedDays = [...planningFrequencyChecks.querySelectorAll("input[type='checkbox']:checked")]
            .map((input) => Number(input.value));

        if (selectedDays.length === 0) {
            if (planningModalError) planningModalError.textContent = "Warning: Select at least one day.";
            return;
        }

        const originalText = planningModalSave.textContent;
        planningModalSave.disabled = true;
        planningModalSave.textContent = "Saving...";

        try {
            const res = await fetch(`/api/habits/${selectedPlanningHabitId}`, {
                method: "PUT",
                headers: authHeaders(true),
                body: JSON.stringify({
                    frequency: selectedDays,
                    timeOfDay: planningTimeOfDaySelect.value
                })
            });

            if (checkUnauthorized(res)) return;
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not update planning settings.");

            closePlanningModal();
            if (typeof refreshHabits === "function") {
                await refreshHabits();
            }
        } catch (error) {
            if (planningModalError) planningModalError.textContent = `Warning: ${error.message}`;
        } finally {
            planningModalSave.disabled = false;
            planningModalSave.textContent = originalText;
        }
    };

    const renderPlanning = (habits) => {
        syncDateNavigationUI();
        renderWeeklyArchitect(habits);
        renderYearlyProgress(habits);
        renderTimeBlocking(habits);
    };

    if (planningModalClose) planningModalClose.addEventListener("click", closePlanningModal);
    if (planningModalCancel) planningModalCancel.addEventListener("click", closePlanningModal);
    if (planningModalSave) planningModalSave.addEventListener("click", savePlanningChanges);
    if (planningEditModal) {
        planningEditModal.addEventListener("click", (event) => {
            if (event.target === planningEditModal) {
                closePlanningModal();
            }
        });
    }
    if (datePicker) {
        datePicker.value = selectedDate;
        datePicker.addEventListener("change", () => {
            const incomingDate = datePicker.value;
            if (!incomingDate) return;
            selectedDate = incomingDate;
            renderHabits(allHabits);
            renderPlanning(allHabits);
        });
    }
    if (backToToday) {
        backToToday.addEventListener("click", () => {
            selectedDate = getTodayDate();
            renderHabits(allHabits);
            renderPlanning(allHabits);
        });
    }

    const setActiveView = async (viewName) => {
        Object.entries(views).forEach(([name, el]) => {
            if (!el) return;
            el.classList.toggle("hidden", name !== viewName);
        });

        navItems.forEach((item) => {
            item.classList.toggle("active", item.dataset.view === viewName);
        });

        if (viewName === "progress") {
            await loadProgress(activePeriod);
        }

        if (viewName === "planning") {
            renderPlanning(allHabits);
        }
    };

    navItems.forEach((item) => {
        item.addEventListener("click", async (e) => {
            e.preventDefault();
            const viewName = item.dataset.view;
            if (!viewName || !views[viewName]) return;
            await setActiveView(viewName);
        });
    });

    // Chat logic
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
                errorText.textContent = "Warning: Please enter a prompt.";
                return;
            }
            if (userPrompt.length > 250) {
                errorText.textContent = "Warning: Prompt is too long (Max 250 chars).";
                return;
            }

            loading.style.display = "block";
            button.disabled = true;
            button.textContent = "Generating...";
            responseContainer.classList.add("hidden");
            errorText.textContent = "";
            promptInput.value = "";

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: authHeaders(true),
                    body: JSON.stringify({ prompt: userPrompt }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const data = await res.json();

                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error(data.error || data.details || "API connection failed.");
                if (!data.response) throw new Error("Received an invalid response from the server.");
                if (!Array.isArray(data.habits) || data.habits.length !== 3) {
                    throw new Error("AI did not return exactly 3 habits.");
                }

                responseText.textContent = data.response;
                responseContainer.classList.remove("hidden");
                if (typeof refreshHabits === "function") await refreshHabits();
            } catch (err) {
                if (err.name === "AbortError") {
                    errorText.textContent = "Warning: Request timed out. Please try again.";
                } else {
                    errorText.textContent = `Warning: ${err.message}`;
                }
            } finally {
                loading.style.display = "none";
                button.disabled = false;
                button.textContent = "Send";
                window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            }
        });
    }

    // Habits logic
    const addHabitForm = document.getElementById("addHabitForm");
    const habitsList = document.getElementById("habitsList");
    const habitErrorText = document.getElementById("habitError");

    if (appContainer && token && addHabitForm && habitsList) {
        const fetchHabits = async () => {
            try {
                const res = await fetch("/api/habits", { headers: authHeaders() });
                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error("Failed to load habits");
                const habits = await res.json();
                allHabits = habits;
                renderHabits(habits);
                renderPlanning(habits);
            } catch (err) {
                console.error(err);
                if (habitErrorText) habitErrorText.textContent = "Warning: Failed to fetch habits.";
            }
        };
        refreshHabits = fetchHabits;

        renderHabits = (habits) => {
            habitsList.innerHTML = "";
            const selectedDayIndex = getDayIndexFromDate(selectedDate);
            const selectedDayHabits = habits.filter((habit) => isHabitScheduledForDay(habit, selectedDayIndex));

            if (selectedDayHabits.length === 0) {
                habitsList.innerHTML = "<p style='color: var(--text-sub); font-size: 0.95rem; text-align: center;'>No habits scheduled for this date. Update your plan in Planning.</p>";
                return;
            }

            selectedDayHabits.forEach((habit) => {
                const card = document.createElement("div");
                card.className = "habit-card";

                const safeTitle = escapeHtml(formatHabitTitle(habit.title));
                const safeDesc = habit.description ? escapeHtml(habit.description) : "";

                card.innerHTML = `
                    <div class="habit-info">
                        <h3>${safeTitle}</h3>
                        ${safeDesc ? `<p>${safeDesc}</p>` : ""}
                    </div>
                    <div class="habit-actions">
                        <button
                            type="button"
                            class="delete-all-btn delete-btn"
                            data-dashboard-action="delete-db"
                            data-habit-id="${habit._id}"
                            title="Delete permanently"
                        >Delete</button>
                    </div>
                `;
                habitsList.appendChild(card);
            });
        };

        const upsertHabitInState = (updatedHabit) => {
            allHabits = allHabits.map((habit) => habit._id === updatedHabit._id ? updatedHabit : habit);
            renderHabits(allHabits);
            renderPlanning(allHabits);
        };

        const removeHabitFromState = (habitId) => {
            allHabits = allHabits.filter((habit) => habit._id !== habitId);
            hiddenFromTimeBlocking.delete(habitId);
            renderHabits(allHabits);
            renderPlanning(allHabits);
        };

        // UI-only planning delete: hides card from Time Blocking without touching DB/API.
        const removeFromTimeBlocking = (habitId) => {
            if (!habitId) return;
            hiddenFromTimeBlocking.add(habitId);
            renderPlanning(allHabits);
        };

        // Shared status updater for Planning actions; keeps backend contract as PUT /api/habits/:id + {status, date}.
        const updateHabitStatus = async (habitId, nextStatus, dateKey, buttonElement) => {
            if (!habitId || !nextStatus) return;
            if (!isViewingToday()) {
                if (habitErrorText) habitErrorText.textContent = "Warning: You can only update habits for today.";
                return;
            }
            const originalHTML = buttonElement ? buttonElement.innerHTML : "";
            if (buttonElement) {
                buttonElement.disabled = true;
                buttonElement.innerHTML = "...";
            }

            try {
                const res = await fetch(`/api/habits/${habitId}`, {
                    method: "PUT",
                    headers: authHeaders(true),
                    body: JSON.stringify({ status: nextStatus, date: dateKey || getTodayDate() })
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not update");

                if (habitErrorText) habitErrorText.textContent = "";
                upsertHabitInState(data);
            } catch (err) {
                if (habitErrorText) habitErrorText.textContent = `Warning: ${err.message || "Server error modifying habit."}`;
                if (buttonElement) {
                    buttonElement.disabled = false;
                    buttonElement.innerHTML = originalHTML;
                }
            }
        };

        // Permanent delete for Daily Agenda: calls DELETE /api/habits/:id.
        const deleteHabitFromDB = async (id, btnElement) => {
            if (!confirm("Are you sure you want to delete this habit permanently?")) return;
            const originalHTML = btnElement.innerHTML;
            btnElement.disabled = true;
            btnElement.innerHTML = "...";

            try {
                const res = await fetch(`/api/habits/${id}`, {
                    method: "DELETE",
                    headers: authHeaders()
                });
                if (checkUnauthorized(res)) return;
                if (!res.ok) throw new Error("Could not delete");
                if (habitErrorText) habitErrorText.textContent = "";
                removeHabitFromState(id);
            } catch (err) {
                if (habitErrorText) habitErrorText.textContent = "Warning: Server error deleting habit.";
                btnElement.disabled = false;
                btnElement.innerHTML = originalHTML;
            }
        };

        if (habitsList) {
            habitsList.addEventListener("click", async (event) => {
                const deleteButton = event.target.closest("[data-dashboard-action='delete-db']");
                if (!deleteButton) return;
                const habitId = deleteButton.dataset.habitId;
                if (!habitId) return;
                await deleteHabitFromDB(habitId, deleteButton);
            });
        }

        if (planningSection) {
            // Event delegation avoids duplicate listeners when Planning cards are re-rendered.
            planningSection.addEventListener("click", async (event) => {
                const actionBtn = event.target.closest("[data-planning-action]");
                if (actionBtn) {
                    const action = actionBtn.dataset.planningAction;
                    const habitId = actionBtn.dataset.habitId;
                    if (!habitId) return;

                    if (action === "delete") {
                        removeFromTimeBlocking(habitId);
                        return;
                    }

                    const nextStatus = actionBtn.dataset.nextStatus;
                    const dateKey = actionBtn.dataset.date || getTodayDate();
                    await updateHabitStatus(habitId, nextStatus, dateKey, actionBtn);
                    return;
                }

                const badge = event.target.closest(".habit-badge");
                if (!badge) return;
                openPlanningModal(badge.dataset.habitId);
            });
        }

        addHabitForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("habitTitle");
            const descInput = document.getElementById("habitDesc");
            const titleVal = titleInput.value.trim();
            const descVal = descInput.value.trim();
            const addBtn = document.getElementById("addHabitBtn");
            const errorElement = document.getElementById("habitError") || { textContent: "" };

            errorElement.textContent = "";

            if (!titleVal) {
                errorElement.textContent = "Warning: Habit title cannot be empty.";
                return;
            }
            if (titleVal.length > 100) {
                errorElement.textContent = "Warning: Title exceeds maximum 100 characters.";
                return;
            }
            if (descVal.length > 250) {
                errorElement.textContent = "Warning: Description exceeds maximum 250 characters.";
                return;
            }

            addBtn.disabled = true;
            addBtn.textContent = "Adding...";

            try {
                const res = await fetch("/api/habits", {
                    method: "POST",
                    headers: authHeaders(true),
                    body: JSON.stringify({ title: titleVal, description: descVal })
                });

                if (checkUnauthorized(res)) return;

                if (res.ok) {
                    titleInput.value = "";
                    descInput.value = "";
                    await fetchHabits();
                } else {
                    const data = await res.json();
                    errorElement.textContent = `Warning: ${data.error || "Failed to add habit"}`;
                }
            } catch {
                errorElement.textContent = "Warning: Connection error. Please try again.";
            } finally {
                addBtn.disabled = false;
                addBtn.textContent = "Add";
            }
        });

        fetchHabits();
    }

    // Progress logic
    const progressStatus = document.getElementById("progressStatus");
    const summaryCompleted = document.getElementById("summaryCompleted");
    const summaryMissed = document.getElementById("summaryMissed");
    const summaryRate = document.getElementById("summaryRate");
    const summaryActive = document.getElementById("summaryActive");
    const trendButtons = document.querySelectorAll(".trend-btn");
    const completionPieCanvas = document.getElementById("completionPieChart");
    const trendCanvas = document.getElementById("trendChart");
    const completedSkeleton = document.getElementById("completedSkeleton");
    const trendSkeleton = document.getElementById("trendSkeleton");
    const completedEmpty = document.getElementById("completedEmpty");
    const trendEmpty = document.getElementById("trendEmpty");
    const donutWrap = document.getElementById("donutWrap");
    const trendWrap = document.getElementById("trendWrap");
    const legendCompletedCount = document.getElementById("legendCompletedCount");
    const legendMissedCount = document.getElementById("legendMissedCount");
    const legendTotalCount = document.getElementById("legendTotalCount");
    const trendGrowth = document.getElementById("trendGrowth");

    const centerTextPlugin = {
        id: "centerTextPlugin",
        afterDraw(chart, args, options) {
            if (chart?.config?.type !== "doughnut") return;
            if (!options || Object.keys(options).length === 0) return;
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data.length) return;
            const centerX = meta.data[0].x;
            const centerY = meta.data[0].y;
            const text = options?.text || "0%";
            const label = options?.label || "Completion";

            ctx.save();
            ctx.textAlign = "center";
            ctx.fillStyle = "#111827";
            ctx.font = "700 1.5rem Inter, sans-serif";
            ctx.fillText(text, centerX, centerY - 4);
            ctx.fillStyle = "#6b7280";
            ctx.font = "500 0.78rem Inter, sans-serif";
            ctx.fillText(label, centerX, centerY + 16);
            ctx.restore();
        }
    };

    if (window.Chart) {
        const alreadyRegistered = window.Chart.registry.plugins.get("centerTextPlugin");
        if (!alreadyRegistered) {
            window.Chart.register(centerTextPlugin);
        }
    }

    const setProgressStatus = (message = "", isError = false, show = false) => {
        if (!progressStatus) return;
        progressStatus.textContent = message;
        progressStatus.classList.toggle("hidden", !show);
        progressStatus.classList.toggle("progress-error", isError);
    };

    const setSkeletonLoading = (isLoading) => {
        if (completedSkeleton) completedSkeleton.classList.toggle("hidden", !isLoading);
        if (trendSkeleton) trendSkeleton.classList.toggle("hidden", !isLoading);
        if (donutWrap) donutWrap.classList.toggle("hidden", isLoading);
        if (trendWrap) trendWrap.classList.toggle("hidden", isLoading);
    };

    const updateSummaryCards = (summary) => {
        if (!summary) return;
        if (summaryCompleted) summaryCompleted.textContent = String(summary.totalCompleted ?? 0);
        if (summaryMissed) summaryMissed.textContent = String(summary.totalMissed ?? 0);
        if (summaryRate) summaryRate.textContent = `${summary.completionRate ?? 0}%`;
        if (summaryActive) summaryActive.textContent = String(summary.activeHabits ?? 0);
    };

    const destroyCharts = () => {
        if (completionPieChart) {
            completionPieChart.destroy();
            completionPieChart = null;
        }
        if (trendChart) {
            trendChart.destroy();
            trendChart = null;
        }
    };

    const updateGrowthChip = (period, completedData) => {
        if (!trendGrowth) return;
        if (!completedData || completedData.length < 2) {
            trendGrowth.textContent = "+0% this week";
            trendGrowth.classList.remove("down");
            return;
        }

        const last = completedData[completedData.length - 1] || 0;
        const prev = completedData[completedData.length - 2] || 0;
        const delta = prev === 0 ? (last > 0 ? 100 : 0) : ((last - prev) / prev) * 100;
        const rounded = Math.round(delta);
        const sign = rounded >= 0 ? "+" : "";
        const label = period === "year" ? "this month" : period === "month" ? "this month" : "this week";
        trendGrowth.textContent = `${sign}${rounded}% ${label}`;
        trendGrowth.classList.toggle("down", rounded < 0);
    };

    const formatTrendLabel = (rawLabel, period) => {
        if (!rawLabel) return "";
        if (period === "year") return rawLabel;
        // rawLabel is YYYY-MM-DD for day/week/month
        const parsed = new Date(`${rawLabel}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return rawLabel;
        const month = parsed.toLocaleString("en-US", { month: "short" });
        const day = parsed.getDate();
        if (period === "day" || period === "week") return `${month} ${day}`;
        return `${month} ${day}`;
    };

    const buildTrendSeries = (trendPoints, period) => {
        const points = Array.isArray(trendPoints) ? trendPoints : [];
        const completedTotal = points.reduce((sum, point) => sum + Number(point?.completed || 0), 0);
        const missedTotal = points.reduce((sum, point) => sum + Number(point?.missed || 0), 0);
        const hasActivity = completedTotal > 0 || missedTotal > 0;

        const labels = [];
        const completedData = [];
        const missedData = [];
        let runningCompleted = 0;
        let runningMissed = 0;

        points.forEach((point) => {
            const completed = Number(point?.completed || 0);
            const missed = Number(point?.missed || 0);

            labels.push(formatTrendLabel(point?.label, period));
            runningCompleted += completed;
            runningMissed += missed;
            completedData.push(runningCompleted);
            missedData.push(runningMissed);
        });

        return { labels, completedData, missedData, hasData: hasActivity };
    };

    const renderProgressCharts = (charts, period, completionRate) => {
        if (!completionPieCanvas || !trendCanvas || !window.Chart) return;
        destroyCharts();

        const completed = Number(charts?.completedVsMissed?.values?.[0] || 0);
        const missed = Number(charts?.completedVsMissed?.values?.[1] || 0);
        const total = completed + missed;
        const hasDonutData = total > 0;

        if (legendCompletedCount) legendCompletedCount.textContent = String(completed);
        if (legendMissedCount) legendMissedCount.textContent = String(missed);
        if (legendTotalCount) legendTotalCount.textContent = String(total);

        if (completedEmpty) completedEmpty.classList.toggle("hidden", hasDonutData);
        if (donutWrap) donutWrap.classList.toggle("hidden", !hasDonutData);

        if (hasDonutData) {
            completionPieChart = new Chart(completionPieCanvas, {
                type: "doughnut",
                data: {
                    labels: charts.completedVsMissed.labels,
                    datasets: [{
                        data: charts.completedVsMissed.values,
                        backgroundColor: ["#10b981", "#ef4444"],
                        borderColor: "#ffffff",
                        borderWidth: 6,
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "72%",
                    animation: {
                        animateRotate: true,
                        duration: 850,
                        easing: "easeOutCubic"
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: "#111827",
                            titleColor: "#ffffff",
                            bodyColor: "#e5e7eb",
                            padding: 10,
                            cornerRadius: 10,
                            callbacks: {
                                label(context) {
                                    const val = Number(context.raw || 0);
                                    const pct = total ? Math.round((val / total) * 100) : 0;
                                    return `${context.label}: ${val} (${pct}%)`;
                                }
                            }
                        },
                        centerTextPlugin: {
                            text: `${Math.round(completionRate || 0)}%`,
                            label: "Completion"
                        }
                    }
                }
            });
        }

        const trendSeries = buildTrendSeries(charts.trend, period);
        const labels = trendSeries.labels;
        const completedData = trendSeries.completedData;
        const missedData = trendSeries.missedData;
        const trendHasData = trendSeries.hasData;

        updateGrowthChip(period, completedData);
        if (trendEmpty) trendEmpty.classList.toggle("hidden", trendHasData);
        if (trendWrap) trendWrap.classList.toggle("hidden", !trendHasData);

        if (!trendHasData) return;

        const trendCtx = trendCanvas.getContext("2d");
        const completedGradient = trendCtx.createLinearGradient(0, 0, 0, trendCanvas.height || 320);
        completedGradient.addColorStop(0, "rgba(16, 185, 129, 0.36)");
        completedGradient.addColorStop(1, "rgba(16, 185, 129, 0.02)");

        const missedGradient = trendCtx.createLinearGradient(0, 0, 0, trendCanvas.height || 320);
        missedGradient.addColorStop(0, "rgba(239, 68, 68, 0.3)");
        missedGradient.addColorStop(1, "rgba(239, 68, 68, 0.02)");

        trendChart = new Chart(trendCanvas, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Completed",
                        data: completedData,
                        borderColor: "#10b981",
                        backgroundColor: completedGradient,
                        fill: true,
                        borderWidth: 2.4,
                        tension: 0,
                        stepped: "before",
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: "Missed",
                        data: missedData,
                        borderColor: "#ef4444",
                        backgroundColor: missedGradient,
                        fill: true,
                        borderWidth: 2,
                        tension: 0,
                        stepped: "before",
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 700,
                    easing: "easeOutQuart"
                },
                interaction: {
                    intersect: false,
                    mode: "index"
                },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            boxWidth: 10,
                            usePointStyle: true,
                            pointStyle: "circle",
                            padding: 16
                        }
                    },
                    tooltip: {
                        backgroundColor: "#111827",
                        titleColor: "#ffffff",
                        bodyColor: "#e5e7eb",
                        padding: 10,
                        cornerRadius: 10
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#6b7280",
                            maxRotation: 0,
                            minRotation: window.innerWidth < 768 ? 35 : 0,
                            autoSkipPadding: 14,
                            autoSkip: true,
                            maxTicksLimit: window.innerWidth < 768 ? (period === "year" ? 6 : 5) : (period === "year" ? 12 : 7)
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: "rgba(148, 163, 184, 0.18)"
                        },
                        ticks: {
                            color: "#6b7280",
                            precision: 0,
                            stepSize: 1,
                            callback(value) {
                                return Number.isInteger(value) ? value : "";
                            }
                        }
                    }
                }
            }
        });
    };

    const loadProgress = async (period) => {
        activePeriod = period;
        trendButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.period === period));
        setProgressStatus("Loading progress...", false, true);
        setSkeletonLoading(true);

        try {
            const res = await fetch(`/api/progress/${period}`, {
                headers: authHeaders()
            });
            if (checkUnauthorized(res)) return;
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to fetch progress data.");

            updateSummaryCards(data.summary);
            renderProgressCharts(data.charts, period, data.summary?.completionRate || 0);
            setProgressStatus("", false, false);
        } catch (error) {
            destroyCharts();
            updateSummaryCards({
                totalCompleted: 0,
                totalMissed: 0,
                completionRate: 0,
                activeHabits: 0
            });
            if (legendCompletedCount) legendCompletedCount.textContent = "0";
            if (legendMissedCount) legendMissedCount.textContent = "0";
            if (legendTotalCount) legendTotalCount.textContent = "0";
            if (completedEmpty) completedEmpty.classList.remove("hidden");
            if (trendEmpty) trendEmpty.classList.remove("hidden");
            if (donutWrap) donutWrap.classList.add("hidden");
            if (trendWrap) trendWrap.classList.add("hidden");
            setProgressStatus(`Warning: ${error.message}`, true, true);
        } finally {
            setSkeletonLoading(false);
        }
    };

    trendButtons.forEach((btn) => {
        btn.addEventListener("click", async () => {
            const period = btn.dataset.period;
            if (!period) return;
            await loadProgress(period);
        });
    });

    setActiveView("dashboard");
});

