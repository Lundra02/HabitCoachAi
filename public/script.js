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
            showToast("Session expired. Please log in again.", "error");
            window.location.href = "login.html";
            return true;
        }
        return false;
    };

    let toastTimer = null;
    const showToast = (message = "", type = "success") => {
        if (!message) return;
        let toast = document.getElementById("appToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "appToast";
            toast.className = "app-toast hidden";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.remove("hidden", "success", "error");
        toast.style.animation = "none";
        void toast.offsetWidth;
        toast.style.animation = "";
        toast.classList.add(type === "error" ? "error" : "success");
        toastTimer = setTimeout(() => {
            toast.classList.add("hidden");
        }, 4200);
    };

    const authHeaders = (withJson = false) => {
        const headers = {
            "Authorization": `Bearer ${token}`,
            "X-User-Timezone": userTimeZone
        };
        if (withJson) headers["Content-Type"] = "application/json";
        return headers;
    };

    const getSettingsTimezone = () => userSettings?.profile?.timezone || userTimeZone || "UTC";

    const appContainer = document.getElementById("app-container");
    if (appContainer && token) {
        appContainer.classList.remove("hidden");
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            const userNameDisplay = document.getElementById("userNameDisplay");
            const userAvatar = document.getElementById("userAvatar");
            const displayName = payload.name || (payload.email ? payload.email.split("@")[0] : "User");
            if (userNameDisplay) {
                userNameDisplay.innerText = displayName;
            }
            if (userAvatar) {
                userAvatar.textContent = displayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("") || "HC";
            }
        } catch (error) {
            // Ignore malformed or old tokens here; API calls below handle invalid sessions.
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
            const email = document.getElementById("email").value.trim();
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
                if (res.status === 403 && data.requiresVerification) {
                    sessionStorage.setItem("pendingVerificationEmail", data.email || email);
                    if (data.verificationCodeExpires) {
                        sessionStorage.setItem("pendingVerificationExpires", data.verificationCodeExpires);
                    }
                    window.location.href = `verify.html?email=${encodeURIComponent(data.email || email)}`;
                    return;
                }
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

                sessionStorage.setItem("pendingVerificationEmail", data.email || email);
                if (data.verificationCodeExpires) {
                    sessionStorage.setItem("pendingVerificationExpires", data.verificationCodeExpires);
                }
                window.location.href = `verify.html?email=${encodeURIComponent(data.email || email)}`;
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
        settings: document.getElementById("settingsView"),
        social: document.getElementById("socialView")
    };
    const weeklyArchitectGrid = document.getElementById("weeklyArchitectGrid");
    const weeklySummary = document.getElementById("weeklySummary");
    const weeklyFilterChips = document.getElementById("weeklyFilterChips");
    const weeklyBalanceSuggestion = document.getElementById("weeklyBalanceSuggestion");
    const weeklyTodayPill = document.getElementById("weeklyTodayPill");
    const yearlyProgressLabel = document.getElementById("yearlyProgressLabel");
    const yearlyProgressFill = document.getElementById("yearlyProgressFill");
    const quarterlyBreakdown = document.getElementById("quarterlyBreakdown");
    const yearlyPaceSummary = document.getElementById("yearlyPaceSummary");
    const timeBlockingView = document.getElementById("timeBlockingView");
    const planningScopeToggle = document.getElementById("planningScopeToggle");
    const timeBlockingScopeToggle = document.getElementById("timeBlockingScopeToggle");
    const timeBlockingCompactToggle = document.getElementById("timeBlockingCompactToggle");
    const timeBlockingSubtitle = document.getElementById("timeBlockingSubtitle");
    const planningSection = document.getElementById("planning-section");
    const planningEditModal = document.getElementById("planningEditModal");
    const planningModalClose = document.getElementById("planningModalClose");
    const planningModalCancel = document.getElementById("planningModalCancel");
    const planningModalSave = document.getElementById("planningModalSave");
    const planningModalDelete = document.getElementById("planningModalDelete");
    const planningModalError = document.getElementById("planningModalError");
    const planningHabitTitle = document.getElementById("planningHabitTitle");
    const planningTimeOfDaySelect = document.getElementById("planningTimeOfDaySelect");
    const planningDifficultySelect = document.getElementById("planningDifficultySelect");
    const planningFrequencyChecks = document.getElementById("planningFrequencyChecks");
    const datePicker = document.getElementById("datePicker");
    const customDateBtn = document.getElementById("customDateBtn");
    const customDatePopover = document.getElementById("customDatePopover");
    const customDateBackdrop = document.getElementById("customDateBackdrop");
    const customDateGrid = document.getElementById("customDateGrid");
    const datePopoverTitle = document.getElementById("datePopoverTitle");
    const datePrevMonth = document.getElementById("datePrevMonth");
    const dateNextMonth = document.getElementById("dateNextMonth");
    const viewingDate = document.getElementById("viewingDate");
    const backToToday = document.getElementById("backToToday");
    const historyModeLabel = document.getElementById("historyModeLabel");
    const todayLabel = document.getElementById("todayLabel");
    const dashboardCompletedToday = document.getElementById("dashboardCompletedToday");
    const dashboardCurrentStreak = document.getElementById("dashboardCurrentStreak");
    const dashboardWeeklyConsistency = document.getElementById("dashboardWeeklyConsistency");
    const dashboardAiScore = document.getElementById("dashboardAiScore");
    const energyMatchSelect = document.getElementById("energyMatchSelect");
    const energyRecommendationList = document.getElementById("energyRecommendationList");
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const timeBuckets = ["Morning", "Afternoon", "Evening"];
    const difficultyLevels = ["easy", "medium", "hard"];
    const weeklyFilterOptions = [
        { value: "all", label: "All" },
        { value: "Morning", label: "Morning" },
        { value: "Afternoon", label: "Afternoon" },
        { value: "Evening", label: "Evening" },
        { value: "high", label: "High Priority" },
        { value: "medium", label: "Medium" }
    ];
    let selectedPlanningHabitId = "";
    let customDateView = null;
    let planningHabitScope = ["my", "duo"].includes(localStorage.getItem("planningHabitScope"))
        ? localStorage.getItem("planningHabitScope")
        : "my";
    let weeklyArchitectFilter = weeklyFilterOptions.some((option) => option.value === localStorage.getItem("weeklyArchitectFilter"))
        ? localStorage.getItem("weeklyArchitectFilter")
        : "all";
    const collapsedWeeklyDays = new Set();
    let timeBlockingScope = ["today", "week"].includes(localStorage.getItem("timeBlockingScope"))
        ? localStorage.getItem("timeBlockingScope")
        : "today";
    let timeBlockingCompact = localStorage.getItem("timeBlockingCompact") === "true";
    const defaultSettings = {
        profile: {
            name: "",
            email: "",
            timezone: userTimeZone
        },
        settings: {
            aiCoach: {
                coachingStyle: "balanced",
                focusAreas: ["productivity"],
                dailyCheckInTime: "18:00",
                recommendationIntensity: "normal"
            },
            notifications: {
                morningBriefing: true,
                eveningReview: true,
                missedHabitReminders: true,
                weeklyProgressReport: true
            },
            habitDefaults: {
                difficulty: "medium",
                timeOfDay: "Morning",
                frequencyPreset: "everyday",
                customFrequency: [1, 2, 3, 4, 5]
            },
            dashboard: {
                startPage: localStorage.getItem("startPage") || "dashboard",
                showDailyReview: true,
                showEnergyMatch: true,
                compactMode: false
            }
        },
        xp: 0,
        level: 1,
        streakFreezes: 0,
        frozenDates: [],
        badges: []
    };
    let userSettings = JSON.parse(JSON.stringify(defaultSettings));

    const escapeHtml = (value = "") =>
        String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const stripRawIdNoise = (value = "") => String(value).replace(/\b\d{7,}\b/g, " ").replace(/\s+/g, " ").trim();
    const formatHabitTitle = (title = "") => stripRawIdNoise(title) || "Untitled Habit";
    const normalizeDifficultyValue = (difficulty) => difficultyLevels.includes(difficulty) ? difficulty : "medium";
    const formatDifficulty = (difficulty) => {
        const cleanDifficulty = normalizeDifficultyValue(difficulty);
        return cleanDifficulty.charAt(0).toUpperCase() + cleanDifficulty.slice(1);
    };
    const getTimeClass = (timeOfDay = "Morning") => `time-${String(timeOfDay).toLowerCase()}`;
    const getHabitTimeOfDay = (habit) => timeBuckets.includes(habit?.timeOfDay) ? habit.timeOfDay : "Morning";
    const getSelectedWeekDateForDayIndex = (dayIndex) => {
        const parts = selectedDate.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const base = new Date(year, month, day, 12, 0, 0);
        if (Number.isNaN(base.getTime())) return getTodayDate();
        base.setDate(base.getDate() + (dayIndex - base.getDay()));
        return getDateKey(base);
    };

    const getOrderedWeekDayIndexes = () => [1, 2, 3, 4, 5, 6, 0];

    const getHabitScheduledDayLabels = (habit) => getOrderedWeekDayIndexes()
        .filter((dayIndex) => isHabitScheduledForDay(habit, dayIndex))
        .map((dayIndex) => dayNames[dayIndex].slice(0, 3));
    const matchesWeeklyFilter = (habit) => {
        if (weeklyArchitectFilter === "all") return true;
        if (timeBuckets.includes(weeklyArchitectFilter)) return getHabitTimeOfDay(habit) === weeklyArchitectFilter;
        const difficulty = normalizeDifficultyValue(habit?.difficulty);
        if (weeklyArchitectFilter === "high") return difficulty === "hard";
        if (weeklyArchitectFilter === "medium") return difficulty === "medium";
        return true;
    };
    const getWeeklyPlanCounts = (habits = allHabits) => dayNames.map((dayName, dayIndex) => ({
        dayIndex,
        dayName,
        count: habits.filter((habit) => isHabitScheduledForDay(habit, dayIndex)).length
    }));
    const renderWeeklyFilters = () => {
        if (!weeklyFilterChips) return;
        weeklyFilterChips.innerHTML = weeklyFilterOptions
            .map((option) => `
                <button type="button" class="planning-chip ${weeklyArchitectFilter === option.value ? "active" : ""}" data-weekly-filter="${option.value}">
                    ${option.label}
                </button>
            `)
            .join("");
    };
    const renderWeeklySummary = (habits = allHabits) => {
        if (!weeklySummary) return;
        const counts = getWeeklyPlanCounts(habits);
        const plannedCount = counts.reduce((sum, item) => sum + item.count, 0);
        const activeDays = counts.filter((item) => item.count > 0).length;
        const mostLoaded = counts.reduce((max, item) => item.count > max.count ? item : max, counts[0] || { dayName: "--", count: 0 });

        weeklySummary.innerHTML = `
            <div class="weekly-summary-card">
                <span>Habits planned</span>
                <strong>${plannedCount}</strong>
            </div>
            <div class="weekly-summary-card">
                <span>Active days</span>
                <strong>${activeDays}</strong>
            </div>
            <div class="weekly-summary-card">
                <span>Most loaded day</span>
                <strong>${mostLoaded.count > 0 ? mostLoaded.dayName : "--"}</strong>
            </div>
        `;
    };
    const renderWeeklyBalanceSuggestion = (habits = allHabits) => {
        if (!weeklyBalanceSuggestion) return;
        const counts = getWeeklyPlanCounts(habits);
        const busiest = counts.reduce((max, item) => item.count > max.count ? item : max, counts[0] || { count: 0 });
        const lightest = counts.reduce((min, item) => item.count < min.count ? item : min, counts[0] || { count: 0 });
        const shouldSuggest = busiest.count >= 4 && busiest.count - lightest.count >= 2;

        weeklyBalanceSuggestion.classList.toggle("hidden", !shouldSuggest);
        weeklyBalanceSuggestion.textContent = shouldSuggest
            ? `Balance week: ${busiest.dayName} has ${busiest.count} habits. Move one into ${lightest.dayName} to reduce overload.`
            : "";
    };
    const getDefaultFrequencyDays = () => {
        const defaults = userSettings.settings.habitDefaults;
        if (defaults.frequencyPreset === "weekdays") return [1, 2, 3, 4, 5];
        if (defaults.frequencyPreset === "custom" && Array.isArray(defaults.customFrequency) && defaults.customFrequency.length) {
            return defaults.customFrequency;
        }
        return [0, 1, 2, 3, 4, 5, 6];
    };

    const normalizeFrequency = (frequency) => {
        if (!Array.isArray(frequency) || frequency.length === 0) return [0, 1, 2, 3, 4, 5, 6];
        const days = [...new Set(frequency.map((day) => Number(day)))].filter((day) =>
            Number.isInteger(day) && day >= 0 && day <= 6
        );
        return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
    };

    const isDefaultActiveDay = (dayIndex) => getDefaultFrequencyDays().includes(dayIndex);
    const isHabitScheduledForDay = (habit, dayIndex) =>
        isDefaultActiveDay(dayIndex) && normalizeFrequency(habit.frequency).includes(dayIndex);
    const isAcceptedDuoHabit = (habit) => Boolean(habit?.isShared && habit?.shareStatus === "accepted");
    const getPlanningScopeHabits = (habits = allHabits) => {
        if (planningHabitScope === "duo") {
            return habits.filter(isAcceptedDuoHabit);
        }
        return habits.filter((habit) => !isAcceptedDuoHabit(habit));
    };
    const syncPlanningScopeToggle = () => {
        if (!planningScopeToggle) return;
        planningScopeToggle.querySelectorAll("[data-planning-scope]").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.planningScope === planningHabitScope);
        });
    };
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

    const shiftDateKey = (dateKey, deltaDays) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return dateKey;
        parsed.setDate(parsed.getDate() + deltaDays);
        return getDateKey(parsed);
    };

    const parseDateKey = (dateKey) => {
        const parts = String(dateKey || "").split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const parsed = new Date(year, month, day, 12, 0, 0);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const setSelectedPlanningDate = (dateKey) => {
        selectedDate = dateKey || getTodayDate();
        renderHabits(allHabits);
        renderPlanning(allHabits);
    };

    const getHabitStatusForDate = (habit, dateKey) => {
        const record = getHabitHistoryRecord(habit, dateKey);
        if (record?.status) return record.status;
        return dateKey === getTodayDate() ? (habit.status || "pending") : "pending";
    };

    const getDayHabitStats = (habits, dateKey) => habits.reduce((stats, habit) => {
        if (!isHabitScheduledForDay(habit, getDayIndexFromDate(dateKey))) return stats;
        const status = getHabitStatusForDate(habit, dateKey);
        if (status === "completed") stats.completed += 1;
        if (status === "missed") stats.missed += 1;
        if (status === "pending") stats.pending += 1;
        return stats;
    }, { completed: 0, missed: 0, pending: 0 });

    const getCurrentStreak = (habits) => {
        let streak = 0;
        let cursor = getTodayDate();

        for (let i = 0; i < 365; i += 1) {
            const stats = getDayHabitStats(habits, cursor);
            if (stats.completed > 0 && stats.missed === 0) {
                streak += 1;
                cursor = shiftDateKey(cursor, -1);
                continue;
            }
            break;
        }

        return streak;
    };

    const updateDashboardStats = (habits = []) => {
        const todayKey = getTodayDate();
        const todayStats = getDayHabitStats(habits, todayKey);
        const currentStreak = getCurrentStreak(habits);

        let weeklyCompleted = 0;
        let weeklyMissed = 0;
        for (let i = 0; i < 7; i += 1) {
            const stats = getDayHabitStats(habits, shiftDateKey(todayKey, -i));
            weeklyCompleted += stats.completed;
            weeklyMissed += stats.missed;
        }

        const weeklyTotal = weeklyCompleted + weeklyMissed;
        const weeklyConsistency = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;
        const volumeScore = Math.min(todayStats.completed * 5, 18);
        const streakScore = Math.min(currentStreak * 8, 24);
        const aiScore = Math.min(100, Math.round((weeklyConsistency * 0.58) + streakScore + volumeScore));

        if (dashboardCompletedToday) dashboardCompletedToday.textContent = String(todayStats.completed);
        if (dashboardCurrentStreak) dashboardCurrentStreak.textContent = `${currentStreak}d`;
        if (dashboardWeeklyConsistency) dashboardWeeklyConsistency.textContent = `${weeklyConsistency}%`;
        if (dashboardAiScore) dashboardAiScore.textContent = String(aiScore);
    };

    const getCurrentTimeBucket = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Morning";
        if (hour < 17) return "Afternoon";
        return "Evening";
    };

    const getEnergyDifficultyRank = (energy) => {
        if (energy === "low") return { easy: 0, medium: 1, hard: 3 };
        if (energy === "high") return { hard: 0, medium: 1, easy: 2 };
        return { medium: 0, easy: 1, hard: 1 };
    };

    const renderEnergyRecommendations = (habits = allHabits) => {
        if (!energyRecommendationList) return;
        const selectedEnergy = energyMatchSelect?.value || "medium";
        const currentBlock = getCurrentTimeBucket();
        const selectedDayIndex = getDayIndexFromDate(getTodayDate());
        const rank = getEnergyDifficultyRank(selectedEnergy);

        const candidates = habits
            .filter((habit) => isHabitScheduledForDay(habit, selectedDayIndex))
            .filter((habit) => getHabitStatusForDate(habit, getTodayDate()) !== "completed")
            .map((habit) => {
                const difficulty = normalizeDifficultyValue(habit.difficulty);
                const timeOfDay = timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning";
                const timePenalty = timeOfDay === currentBlock ? 0 : 2;
                return {
                    habit,
                    difficulty,
                    timeOfDay,
                    score: (rank[difficulty] ?? 2) + timePenalty
                };
            })
            .sort((a, b) => a.score - b.score || a.timeOfDay.localeCompare(b.timeOfDay))
            .slice(0, 3);

        if (candidates.length === 0) {
            energyRecommendationList.innerHTML = "<p class=\"energy-empty\">No pending habits match today yet. Add a habit or update your weekly plan.</p>";
            return;
        }

        energyRecommendationList.innerHTML = candidates
            .map(({ habit, difficulty, timeOfDay }) => `
                <article class="energy-recommendation-card">
                    <strong>${escapeHtml(formatHabitTitle(habit.title))}</strong>
                    <span>${escapeHtml(formatDifficulty(difficulty))} · ${escapeHtml(timeOfDay)} · ${timeOfDay === currentBlock ? "right time block" : "later fit"}</span>
                </article>
            `)
            .join("");
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

    const formatTimeBlockingDate = (dateKey) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return dateKey;
        return parsed.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric"
        });
    };

    if (todayLabel) {
        todayLabel.textContent = formatViewingDate(getTodayDate());
    }

    const renderWeekDaysRow = () => {
        const weekDaysRow = document.getElementById("weekDaysRow");
        if (!weekDaysRow) return;

        weekDaysRow.innerHTML = "";

        // Parse selectedDate carefully to avoid timezone shift
        const parts = selectedDate.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const current = new Date(year, month, day, 12, 0, 0);
        const currentDayOfWeek = current.getDay();

        // Distance to Monday (1)
        const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
        
        const monday = new Date(current);
        monday.setDate(current.getDate() + distanceToMonday);

        for (let i = 0; i < 7; i++) {
            const tempDay = new Date(monday);
            tempDay.setDate(monday.getDate() + i);

            const yyyy = tempDay.getFullYear();
            const mm = String(tempDay.getMonth() + 1).padStart(2, '0');
            const dd = String(tempDay.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;

            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === getTodayDate();

            const dayName = tempDay.toLocaleString("en-US", { weekday: "short" }).toUpperCase();
            const dayNum = tempDay.getDate();

            const dayBtn = document.createElement("button");
            dayBtn.type = "button";
            dayBtn.className = `week-day-btn ${isSelected ? "active" : ""} ${isToday ? "is-today" : ""}`;
            dayBtn.innerHTML = `
                <span class="day-name">${dayName}</span>
                <span class="day-number">${dayNum}</span>
            `;

            dayBtn.addEventListener("click", () => {
                setSelectedPlanningDate(dateStr);
            });

            weekDaysRow.appendChild(dayBtn);
        }
    };

    const setCustomDateOpen = (isOpen) => {
        if (!customDatePopover || !customDateBtn) return;
        customDatePopover.classList.toggle("hidden", !isOpen);
        customDateBackdrop?.classList.toggle("hidden", !isOpen);
        customDateBtn.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
            const selected = parseDateKey(selectedDate);
            customDateView = new Date(selected.getFullYear(), selected.getMonth(), 1, 12, 0, 0);
            renderCustomDateCalendar();
            requestAnimationFrame(() => {
                customDateGrid?.querySelector(".date-day-btn.is-selected")?.focus();
            });
        } else {
            customDateBtn.focus();
        }
    };

    const renderCustomDateCalendar = () => {
        if (!customDateGrid || !datePopoverTitle) return;
        const viewDate = customDateView || parseDateKey(selectedDate);
        const viewYear = viewDate.getFullYear();
        const viewMonth = viewDate.getMonth();
        datePopoverTitle.textContent = viewDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric"
        });

        const firstOfMonth = new Date(viewYear, viewMonth, 1, 12, 0, 0);
        const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(firstOfMonth.getDate() - mondayOffset);

        customDateGrid.innerHTML = "";
        for (let index = 0; index < 42; index += 1) {
            const date = new Date(gridStart);
            date.setDate(gridStart.getDate() + index);
            const dateKey = getDateKey(date);
            const isSelected = dateKey === selectedDate;
            const isToday = dateKey === getTodayDate();
            const isMuted = date.getMonth() !== viewMonth;

            const dayBtn = document.createElement("button");
            dayBtn.type = "button";
            dayBtn.className = `date-day-btn ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""} ${isMuted ? "is-muted" : ""}`;
            dayBtn.textContent = String(date.getDate());
            dayBtn.dataset.date = dateKey;
            dayBtn.setAttribute("role", "gridcell");
            dayBtn.setAttribute("aria-selected", String(isSelected));
            dayBtn.setAttribute("aria-label", date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            }));
            dayBtn.addEventListener("click", () => {
                setSelectedPlanningDate(dateKey);
                setCustomDateOpen(false);
            });
            customDateGrid.appendChild(dayBtn);
        }
    };

    const syncDateNavigationUI = () => {
        if (datePicker) datePicker.value = selectedDate;
        if (viewingDate) viewingDate.textContent = `Viewing: ${formatViewingDate(selectedDate)}`;
        if (customDatePopover && !customDatePopover.classList.contains("hidden")) {
            renderCustomDateCalendar();
        }
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

        const freezeDayBtn = document.getElementById("freezeDayBtn");
        if (freezeDayBtn) {
            const todayStr = getTodayDate();
            if (selectedDate < todayStr) {
                freezeDayBtn.classList.remove("hidden");
                const isAlreadyFrozen = userSettings.frozenDates && userSettings.frozenDates.includes(selectedDate);
                if (isAlreadyFrozen) {
                    freezeDayBtn.textContent = "❄️ Day Frozen";
                    freezeDayBtn.disabled = true;
                    freezeDayBtn.style.opacity = "0.7";
                } else {
                    freezeDayBtn.textContent = "❄️ Freeze Day";
                    freezeDayBtn.disabled = false;
                    freezeDayBtn.style.opacity = "1";
                }
            } else {
                freezeDayBtn.classList.add("hidden");
            }
        }

        renderWeekDaysRow();
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
        const cleanDifficulty = escapeHtml(formatDifficulty(habit.difficulty));
        return `
            <button type="button" class="habit-badge" data-habit-id="${habit._id}" title="Edit plan">
                <span>${cleanTitle}</span>
                <small>${cleanTime} · ${cleanDifficulty}</small>
            </button>
        `;
    };

    const renderWeeklyHabitBadge = (habit, dayIndex) => {
        const cleanTitle = escapeHtml(formatHabitTitle(habit.title));
        const timeOfDay = getHabitTimeOfDay(habit);
        const cleanTime = escapeHtml(timeOfDay);
        const difficulty = normalizeDifficultyValue(habit.difficulty);
        const cleanDifficulty = escapeHtml(formatDifficulty(difficulty));
        const dateKey = getSelectedWeekDateForDayIndex(dayIndex);
        const { displayStatus, statusLabel } = getHabitDisplayState(habit, dateKey);
        return `
            <article
                class="habit-badge"
                draggable="true"
                data-habit-id="${habit._id}"
                data-source-day-index="${dayIndex}"
                title="Drag to another day or click to edit"
            >
                <div class="habit-badge-main">
                    <div>
                        <strong>${cleanTitle}</strong>
                        <small>
                            <span class="time-label ${getTimeClass(timeOfDay)}">${cleanTime}</span>
                            <span class="difficulty-mini difficulty-${difficulty}">${cleanDifficulty}</span>
                        </small>
                    </div>
                </div>
                <div class="weekly-quick-actions" aria-label="Quick habit actions">
                    <button type="button" title="Edit time" data-planning-action="edit" data-habit-id="${habit._id}">Edit</button>
                    <button type="button" title="Remove from this day" data-planning-action="remove-day" data-habit-id="${habit._id}" data-day-index="${dayIndex}">Remove</button>
                    <button type="button" title="Duplicate to another day" data-planning-action="duplicate-day" data-habit-id="${habit._id}" data-day-index="${dayIndex}">+Day</button>
                </div>
            </article>
        `;
    };

    const getEnergyMatchText = (habit, block) => {
        const difficulty = normalizeDifficultyValue(habit?.difficulty);
        const currentBlock = getCurrentTimeBucket();
        if (block === currentBlock) return "Right now";
        if (difficulty === "hard" && block === "Morning") return "Deep focus";
        if (difficulty === "easy" && block === "Evening") return "Light lift";
        return "Good fit";
    };

    const renderTimeBlockHabitCardV2 = (habit, block, options = {}) => {
        const cardDateKey = options.dateKey || selectedDate;
        const showDayChips = Boolean(options.showDayChips);
        const safeTitle = escapeHtml(formatHabitTitle(habit.title));
        const safeDesc = habit.description ? escapeHtml(habit.description) : "";
        const difficulty = normalizeDifficultyValue(habit.difficulty);
        const difficultyLabel = escapeHtml(formatDifficulty(difficulty));
        const { displayStatus, isLocked, statusLabel, dateKey, readOnlyMode } = getHabitDisplayState(habit, cardDateKey);
        const isCompleted = displayStatus === "completed";
        const actionType = isCompleted ? "undo" : "complete";
        const actionLabel = isCompleted ? "Undo" : "Done";
        const nextStatus = isCompleted ? "pending" : "completed";
        const blockIndex = timeBuckets.indexOf(block);
        const previousBlock = timeBuckets[blockIndex - 1] || "";
        const nextBlock = timeBuckets[blockIndex + 1] || "";
        const dayChips = showDayChips
            ? `<div class="habit-day-chips" aria-label="Scheduled days">
                ${getHabitScheduledDayLabels(habit).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
            </div>`
            : "";
        return `
            <article
                class="habit-card time-block-habit ${isCompleted ? "completed" : ""} ${displayStatus === "missed" ? "missed" : ""}"
                draggable="true"
                data-habit-id="${habit._id}"
                data-time-block="${block}"
                ${readOnlyMode ? "style=\"opacity:0.72;filter:grayscale(0.15);\"" : ""}
            >
                <div class="habit-actions time-block-actions">
                    ${previousBlock ? `<button type="button" class="icon-action-btn" title="Move to ${previousBlock}" data-planning-action="move-time" data-habit-id="${habit._id}" data-time-block="${previousBlock}">&larr;</button>` : ""}
                    ${nextBlock ? `<button type="button" class="icon-action-btn" title="Move to ${nextBlock}" data-planning-action="move-time" data-habit-id="${habit._id}" data-time-block="${nextBlock}">&rarr;</button>` : ""}
                    <button
                        type="button"
                        class="status-btn"
                        title="${actionLabel}"
                        data-planning-action="${actionType}"
                        data-habit-id="${habit._id}"
                        data-next-status="${nextStatus}"
                        data-date="${dateKey}"
                        ${isLocked ? "disabled" : ""}
                    >${actionLabel}</button>
                    <button type="button" class="calendar-btn" title="Edit habit" data-planning-action="edit" data-habit-id="${habit._id}">Edit</button>
                    <button type="button" class="delete-btn" title="Remove from Time Blocking" data-planning-action="delete" data-habit-id="${habit._id}">Hide</button>
                </div>
                <div class="habit-info">
                    <h3>
                        ${safeTitle}
                        <span class="status-badge status-${displayStatus}">${statusLabel}</span>
                    </h3>
                    <div class="time-block-meta">
                        <span class="priority-badge difficulty-${difficulty}">${difficultyLabel} priority</span>
                        <span class="energy-match-badge">${escapeHtml(getEnergyMatchText(habit, block))}</span>
                    </div>
                    ${dayChips}
                    ${safeDesc ? `<p>${safeDesc}</p>` : ""}
                    ${readOnlyMode
                        ? `<p class="deadline-text">Viewing history for ${escapeHtml(formatViewingDate(cardDateKey))}. Status updates are disabled.</p>`
                        : (isLocked ? `<p class="deadline-text">Today's deadline passed.</p>` : "")}
                </div>
            </article>
        `;
    };

    const renderWeeklyArchitect = (habits) => {
        if (!weeklyArchitectGrid) return;
        const isDuoScope = planningHabitScope === "duo";
        renderWeeklySummary(habits);
        renderWeeklyFilters();
        renderWeeklyBalanceSuggestion(habits);
        if (weeklyTodayPill) {
            weeklyTodayPill.textContent = dayNames[getDayIndexFromDate(getTodayDate())];
        }
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

        weeklyArchitectGrid.innerHTML = orderedDayIndexes
            .map((dayIndex) => {
                const dayName = dayNames[dayIndex];
                const scheduledHabits = habits.filter((habit) => isHabitScheduledForDay(habit, dayIndex));
                const visibleHabits = scheduledHabits.filter(matchesWeeklyFilter);
                const itemsHtml = scheduledHabits.length
                    ? visibleHabits.length
                        ? visibleHabits
                        .map((habit) => renderWeeklyHabitBadge(habit, dayIndex))
                        .join("")
                        : `<div class="weekly-empty-state"><p>No habits match this filter.</p></div>`
                    : `
                        <div class="weekly-empty-state">
                            <p>${isDuoScope ? "No Duo habits planned" : "No habits planned"}</p>
                            <button type="button" class="planning-secondary-btn" data-planning-action="${isDuoScope ? "open-duos" : "add-day"}" data-day-index="${dayIndex}">
                                ${isDuoScope ? "Open Duos" : "Add habit"}
                            </button>
                        </div>
                    `;
                const isScrollable = visibleHabits.length > 5;
                const isCollapsed = collapsedWeeklyDays.has(dayIndex);
                const relationLabel = dayIndex === previousDayIndex
                    ? "Yesterday"
                    : dayIndex === todayIndex
                        ? "Today"
                        : dayIndex === nextDayIndex
                            ? "Tomorrow"
                            : "";

                return `
                    <div class="weekly-day-card ${dayIndex === todayIndex ? "today" : ""} ${isCollapsed ? "collapsed" : ""}" data-day-index="${dayIndex}">
                        <button type="button" class="weekly-day-head" data-planning-action="toggle-day" data-day-index="${dayIndex}" aria-expanded="${!isCollapsed}">
                            <div>
                                <p class="weekly-day-name">${dayName}</p>
                                <p class="weekly-day-count">${scheduledHabits.length} habits</p>
                            </div>
                            <span class="weekly-day-meta">
                                ${relationLabel ? `<span class="today-pill">${relationLabel}</span>` : ""}
                                <span class="collapse-icon">${isCollapsed ? "+" : "-"}</span>
                            </span>
                        </button>
                        <div class="weekly-day-badges ${isScrollable ? "scrollable" : ""}">${itemsHtml}</div>
                    </div>
                `;
            })
            .join("");
    };

    const renderTimeBlocking = (habits) => {
        if (!timeBlockingView) return;
        const isFullWeek = timeBlockingScope === "week";
        const selectedDayIndex = getDayIndexFromDate(selectedDate);
        if (timeBlockingScopeToggle) {
            timeBlockingScopeToggle.querySelectorAll("[data-time-scope]").forEach((btn) => {
                btn.classList.toggle("active", btn.dataset.timeScope === timeBlockingScope);
            });
        }
        if (timeBlockingSubtitle) {
            timeBlockingSubtitle.textContent = isFullWeek
                ? "Showing all habits scheduled this week."
                : `Showing habits for ${formatTimeBlockingDate(selectedDate)}.`;
        }
        if (timeBlockingCompactToggle) {
            timeBlockingCompactToggle.classList.toggle("active", timeBlockingCompact);
            timeBlockingCompactToggle.setAttribute("aria-pressed", String(timeBlockingCompact));
        }
        timeBlockingView.classList.toggle("compact", timeBlockingCompact);
        timeBlockingView.classList.toggle("full-week-mode", isFullWeek);

        const visibleHabits = habits.filter((habit) => !hiddenFromTimeBlocking.has(habit._id));
        const selectedDayHabits = visibleHabits.filter((habit) => isHabitScheduledForDay(habit, selectedDayIndex));
        const weekDayIndexes = getOrderedWeekDayIndexes();
        const weekHasHabits = weekDayIndexes.some((dayIndex) => visibleHabits.some((habit) => isHabitScheduledForDay(habit, dayIndex)));

        if (!isFullWeek && selectedDayHabits.length === 0) {
            timeBlockingView.innerHTML = `
                <div class="time-block-empty time-block-empty-wide">
                    <p>Free day — no habits scheduled.</p>
                    <button type="button" class="planning-secondary-btn" data-planning-action="${planningHabitScope === "duo" ? "open-duos" : "add-day"}" data-day-index="${selectedDayIndex}">
                        ${planningHabitScope === "duo" ? "Open Duos" : "Add habit"}
                    </button>
                </div>
            `;
            return;
        }

        if (isFullWeek && !weekHasHabits) {
            timeBlockingView.innerHTML = `
                <div class="time-block-empty time-block-empty-wide">
                    <p>No habits scheduled this week.</p>
                    <button type="button" class="planning-secondary-btn" data-planning-action="${planningHabitScope === "duo" ? "open-duos" : "add-day"}" data-day-index="${selectedDayIndex}">
                        ${planningHabitScope === "duo" ? "Open Duos" : "Add habit"}
                    </button>
                </div>
            `;
            return;
        }

        if (!isFullWeek) {
            const groups = {
                Morning: [],
                Afternoon: [],
                Evening: []
            };

            selectedDayHabits.forEach((habit) => {
                const block = timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning";
                groups[block].push(habit);
            });

            timeBlockingView.innerHTML = timeBuckets
            .map((block) => {
                const blockHabits = groups[block];
                const itemsHtml = blockHabits.length
                    ? blockHabits
                        .map((habit) => renderTimeBlockHabitCardV2(habit, block, { dateKey: selectedDate, showDayChips: false }))
                        .join("")
                    : `
                        <div class="time-block-empty">
                            <p>No habits in this time block.</p>
                            <button type="button" class="planning-secondary-btn" data-planning-action="${planningHabitScope === "duo" ? "open-duos" : "add-day"}" data-day-index="${selectedDayIndex}">
                                ${planningHabitScope === "duo" ? "Open Duos" : "Add habit"}
                            </button>
                        </div>
                    `;

                return `
                    <div class="time-block-card" data-time-block="${block}">
                        <div class="time-block-head">
                            <p class="time-block-title ${getTimeClass(block)}">${block}</p>
                            <span class="time-block-count">${blockHabits.length}</span>
                        </div>
                        <div class="time-block-list">${itemsHtml}</div>
                    </div>
                `;
            })
            .join("");
        } else {
            timeBlockingView.innerHTML = weekDayIndexes
                .map((dayIndex) => {
                    const dayDateKey = getSelectedWeekDateForDayIndex(dayIndex);
                    const dayHabits = visibleHabits.filter((habit) => isHabitScheduledForDay(habit, dayIndex));
                    if (!dayHabits.length) return "";
                    const blockSections = timeBuckets
                        .map((block) => {
                            const blockHabits = dayHabits.filter((habit) => (timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning") === block);
                            if (!blockHabits.length) return "";
                            return `
                                <section class="week-time-block" data-time-block="${block}">
                                    <div class="week-time-block-head">
                                        <p class="time-block-title ${getTimeClass(block)}">${block}</p>
                                        <span class="time-block-count">${blockHabits.length}</span>
                                    </div>
                                    <div class="time-block-list">
                                        ${blockHabits.map((habit) => renderTimeBlockHabitCardV2(habit, block, { dateKey: dayDateKey, showDayChips: true })).join("")}
                                    </div>
                                </section>
                            `;
                        })
                        .join("");

                    return `
                        <article class="time-week-day-card" data-day-index="${dayIndex}">
                            <div class="time-week-day-head">
                                <div>
                                    <p class="weekly-day-name">${dayNames[dayIndex]}</p>
                                    <p class="weekly-day-count">${formatViewingDate(dayDateKey)}</p>
                                </div>
                                <span class="today-pill">${dayHabits.length} habits</span>
                            </div>
                            <div class="time-week-day-blocks">${blockSections}</div>
                        </article>
                    `;
                })
                .join("");
        }

        timeBlockingView.querySelectorAll(".time-block-card").forEach((card, index) => {
            card.style.setProperty("--stagger-delay", `${index * 55}ms`);
        });
        timeBlockingView.querySelectorAll(".time-week-day-card").forEach((card, index) => {
            card.style.setProperty("--stagger-delay", `${index * 55}ms`);
        });
        timeBlockingView.querySelectorAll(".time-block-list .habit-card").forEach((card, index) => {
            card.style.setProperty("--stagger-delay", `${index * 35}ms`);
        });
    };

    const syncPlanningStateAfterUpdate = (updatedHabit) => {
        if (!updatedHabit?._id) return;
        allHabits = allHabits.map((habit) => habit._id === updatedHabit._id ? updatedHabit : habit);
        updateDashboardStats(allHabits);
        renderEnergyRecommendations(allHabits);
        renderHabits(allHabits);
        renderPlanning(allHabits);
    };

    const updateHabitPlanningSettings = async (habitId, patch, successMessage = "Planning updated.", buttonElement = null) => {
        if (!habitId || !patch || typeof patch !== "object") return null;
        const originalText = buttonElement ? buttonElement.textContent : "";
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.textContent = "...";
        }

        try {
            const res = await fetch(`/api/habits/${habitId}`, {
                method: "PUT",
                headers: authHeaders(true),
                body: JSON.stringify(patch)
            });
            if (checkUnauthorized(res)) return null;
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not update planning.");
            const updatedHabit = data.habit || data;
            syncPlanningStateAfterUpdate(updatedHabit);
            showToast(successMessage);
            return updatedHabit;
        } catch (error) {
            showToast(error.message || "Could not update planning.", "error");
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.textContent = originalText;
            }
            return null;
        }
    };

    const moveHabitToDay = async (habitId, sourceDayIndex, targetDayIndex, buttonElement = null) => {
        const habit = allHabits.find((item) => item._id === habitId);
        if (!habit || sourceDayIndex === targetDayIndex) return;
        const frequency = normalizeFrequency(habit.frequency);
        const nextFrequency = frequency
            .filter((dayIndex) => dayIndex !== sourceDayIndex)
            .concat(targetDayIndex)
            .filter((dayIndex, index, days) => days.indexOf(dayIndex) === index)
            .sort((a, b) => a - b);
        await updateHabitPlanningSettings(habitId, { frequency: nextFrequency }, `Moved to ${dayNames[targetDayIndex]}.`, buttonElement);
    };

    const removeHabitFromDay = async (habitId, dayIndex, buttonElement = null) => {
        const habit = allHabits.find((item) => item._id === habitId);
        if (!habit) return;
        const frequency = normalizeFrequency(habit.frequency);
        if (frequency.length <= 1) {
            showToast("A habit needs at least one planned day.", "error");
            return;
        }
        const nextFrequency = frequency.filter((item) => item !== dayIndex);
        await updateHabitPlanningSettings(habitId, { frequency: nextFrequency }, `Removed from ${dayNames[dayIndex]}.`, buttonElement);
    };

    const duplicateHabitToNextDay = async (habitId, sourceDayIndex, buttonElement = null) => {
        const habit = allHabits.find((item) => item._id === habitId);
        if (!habit) return;
        const frequency = normalizeFrequency(habit.frequency);
        const targetDayIndex = Array.from({ length: 7 }, (_, index) => (sourceDayIndex + index + 1) % 7)
            .find((dayIndex) => !frequency.includes(dayIndex));
        if (targetDayIndex === undefined) {
            showToast("This habit is already planned every day.", "error");
            return;
        }
        const nextFrequency = [...frequency, targetDayIndex].sort((a, b) => a - b);
        await updateHabitPlanningSettings(habitId, { frequency: nextFrequency }, `Added to ${dayNames[targetDayIndex]}.`, buttonElement);
    };

    const addHabitToDay = async (habitId, targetDayIndex, buttonElement = null) => {
        const habit = allHabits.find((item) => item._id === habitId);
        if (!habit) return;
        const frequency = normalizeFrequency(habit.frequency);
        if (frequency.includes(targetDayIndex)) {
            showToast(`Already planned on ${dayNames[targetDayIndex]}.`);
            return;
        }
        const nextFrequency = [...frequency, targetDayIndex].sort((a, b) => a - b);
        await updateHabitPlanningSettings(habitId, { frequency: nextFrequency }, `Added to ${dayNames[targetDayIndex]}.`, buttonElement);
    };

    const moveHabitToTimeBlock = async (habitId, targetBlock, buttonElement = null) => {
        if (!timeBuckets.includes(targetBlock)) return;
        await updateHabitPlanningSettings(habitId, { timeOfDay: targetBlock }, `Moved to ${targetBlock}.`, buttonElement);
    };

    const startAddHabitForDay = async (dayIndex) => {
        selectedDate = getSelectedWeekDateForDayIndex(dayIndex);
        syncDateNavigationUI();
        renderHabits(allHabits);
        renderPlanning(allHabits);
        await setActiveView("dashboard");
        const titleInput = document.getElementById("habitTitle");
        if (titleInput) {
            titleInput.focus();
            titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        showToast(`Add a habit for ${dayNames[dayIndex]}.`);
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
        
        // Populate inputs
        const titleInput = document.getElementById("planningTitleInput");
        const descInput = document.getElementById("planningDescInput");

        if (titleInput) titleInput.value = habit.title || "";
        if (descInput) descInput.value = habit.description || "";

        planningTimeOfDaySelect.value = timeBuckets.includes(habit.timeOfDay) ? habit.timeOfDay : "Morning";
        if (planningDifficultySelect) planningDifficultySelect.value = normalizeDifficultyValue(habit.difficulty);
        if (planningModalDelete) {
            planningModalDelete.disabled = false;
            planningModalDelete.textContent = "Delete Habit";
        }
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

        const titleInput = document.getElementById("planningTitleInput");
        const descInput = document.getElementById("planningDescInput");

        const updatedTitle = titleInput?.value.trim() || "";
        const updatedDesc = descInput?.value.trim() || "";

        if (!updatedTitle) {
            if (planningModalError) planningModalError.textContent = "Warning: Title cannot be empty.";
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
                    title: updatedTitle,
                    description: updatedDesc,
                    frequency: selectedDays,
                    timeOfDay: planningTimeOfDaySelect.value,
                    difficulty: planningDifficultySelect?.value || "medium",
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
        syncPlanningScopeToggle();
        const scopedHabits = getPlanningScopeHabits(habits);
        renderWeeklyArchitect(scopedHabits);
        renderYearlyProgress(scopedHabits);
        renderTimeBlocking(scopedHabits);
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
            setSelectedPlanningDate(incomingDate);
        });
    }
    if (customDateBtn) {
        customDateBtn.addEventListener("click", () => {
            const isOpen = !customDatePopover?.classList.contains("hidden");
            setCustomDateOpen(!isOpen);
        });
    }
    customDateBackdrop?.addEventListener("click", () => setCustomDateOpen(false));
    datePrevMonth?.addEventListener("click", () => {
        const viewDate = customDateView || parseDateKey(selectedDate);
        customDateView = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1, 12, 0, 0);
        renderCustomDateCalendar();
    });
    dateNextMonth?.addEventListener("click", () => {
        const viewDate = customDateView || parseDateKey(selectedDate);
        customDateView = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1, 12, 0, 0);
        renderCustomDateCalendar();
    });
    customDatePopover?.addEventListener("click", (event) => {
        const quickBtn = event.target.closest("[data-date-quick]");
        if (!quickBtn) return;
        const action = quickBtn.dataset.dateQuick;
        if (action === "today") {
            setSelectedPlanningDate(getTodayDate());
        } else if (action === "tomorrow") {
            setSelectedPlanningDate(shiftDateKey(getTodayDate(), 1));
        } else {
            const today = parseDateKey(getTodayDate());
            const distanceToMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
            const monday = new Date(today);
            monday.setDate(today.getDate() + distanceToMonday);
            setSelectedPlanningDate(getDateKey(monday));
        }
        setCustomDateOpen(false);
    });
    customDatePopover?.addEventListener("keydown", (event) => {
        const activeBtn = event.target.closest(".date-day-btn");
        if (event.key === "Escape") {
            event.preventDefault();
            setCustomDateOpen(false);
            return;
        }
        if (!activeBtn) return;
        const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(event.key in deltas)) return;
        event.preventDefault();
        const nextDate = shiftDateKey(activeBtn.dataset.date, deltas[event.key]);
        const nextParsed = parseDateKey(nextDate);
        customDateView = new Date(nextParsed.getFullYear(), nextParsed.getMonth(), 1, 12, 0, 0);
        renderCustomDateCalendar();
        customDateGrid?.querySelector(`[data-date="${nextDate}"]`)?.focus();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && customDatePopover && !customDatePopover.classList.contains("hidden")) {
            setCustomDateOpen(false);
        }
    });
    if (backToToday) {
        backToToday.addEventListener("click", () => {
            setSelectedPlanningDate(getTodayDate());
        });
    }
    const prevWeekBtn = document.getElementById("prevWeekBtn");
    if (prevWeekBtn) {
        prevWeekBtn.addEventListener("click", () => {
            const parts = selectedDate.split("-");
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const current = new Date(year, month, day, 12, 0, 0);
            current.setDate(current.getDate() - 7);
            const yyyy = current.getFullYear();
            const mm = String(current.getMonth() + 1).padStart(2, '0');
            const dd = String(current.getDate()).padStart(2, '0');
            selectedDate = `${yyyy}-${mm}-${dd}`;
            renderHabits(allHabits);
            renderPlanning(allHabits);
        });
    }
    const nextWeekBtn = document.getElementById("nextWeekBtn");
    if (nextWeekBtn) {
        nextWeekBtn.addEventListener("click", () => {
            const parts = selectedDate.split("-");
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const current = new Date(year, month, day, 12, 0, 0);
            current.setDate(current.getDate() + 7);
            const yyyy = current.getFullYear();
            const mm = String(current.getMonth() + 1).padStart(2, '0');
            const dd = String(current.getDate()).padStart(2, '0');
            selectedDate = `${yyyy}-${mm}-${dd}`;
            renderHabits(allHabits);
            renderPlanning(allHabits);
        });
    }
    if (energyMatchSelect) {
        energyMatchSelect.addEventListener("change", () => renderEnergyRecommendations(allHabits));
    }
    if (planningScopeToggle) {
        planningScopeToggle.addEventListener("click", (event) => {
            const scopeBtn = event.target.closest("[data-planning-scope]");
            if (!scopeBtn) return;
            planningHabitScope = scopeBtn.dataset.planningScope === "duo" ? "duo" : "my";
            localStorage.setItem("planningHabitScope", planningHabitScope);
            renderPlanning(allHabits);
        });
    }

    const setActiveView = async (viewName) => {
        const previousView = localStorage.getItem("lastActiveView");
        Object.entries(views).forEach(([name, el]) => {
            if (!el) return;
            el.classList.toggle("hidden", name !== viewName);
            if (name === viewName) {
                el.classList.remove("view-enter");
                requestAnimationFrame(() => el.classList.add("view-enter"));
            }
        });

        navItems.forEach((item) => {
            item.classList.toggle("active", item.dataset.view === viewName);
        });

        if (previousView && previousView !== viewName) {
            const mainContent = document.querySelector(".main-content");
            const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            mainContent?.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
        }
        localStorage.setItem("lastActiveView", viewName);

        if (viewName === "progress") {
            startDailyCountdown();
            await loadProgress(activePeriod);
        } else {
            stopDailyCountdown();
        }

        if (viewName === "planning") {
            renderPlanning(allHabits);
        }

        if (viewName === "social") {
            await loadSocialView();
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
        const promptContainer = document.getElementById("prompt-container");
        const userPromptText = document.getElementById("userPromptText");
        const errorText = document.getElementById("error");
        const button = document.getElementById("submitBtn");
        const chatDisplay = document.querySelector(".chat-display");

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
            if (userPromptText) userPromptText.textContent = userPrompt;
            if (promptContainer) promptContainer.classList.remove("hidden");
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
                const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                if (chatDisplay) {
                    chatDisplay.scrollTo({
                        top: chatDisplay.scrollHeight,
                        behavior: prefersReducedMotion ? "auto" : "smooth"
                    });
                    return;
                }
                const mainContent = document.querySelector(".main-content");
                if (mainContent) {
                    mainContent.scrollTo({
                        top: mainContent.scrollHeight,
                        behavior: prefersReducedMotion ? "auto" : "smooth"
                    });
                } else {
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: prefersReducedMotion ? "auto" : "smooth"
                    });
                }
            }
        });
    }

    // Daily review logic
    const dailyReviewForm = document.getElementById("dailyReviewForm");
    const reviewWins = document.getElementById("reviewWins");
    const reviewBlockers = document.getElementById("reviewBlockers");
    const reviewEnergy = document.getElementById("reviewEnergy");
    const reviewPriority = document.getElementById("reviewPriority");
    const dailyReviewBtn = document.getElementById("dailyReviewBtn");
    const dailyReviewError = document.getElementById("dailyReviewError");
    const dailyReviewOutput = document.getElementById("dailyReviewOutput");
    const dailyReviewLoading = document.getElementById("dailyReviewLoading");
    const dailyReviewResult = document.getElementById("dailyReviewResult");
    const reviewSummary = document.getElementById("reviewSummary");
    const reviewRecommendations = document.getElementById("reviewRecommendations");
    const reviewTimeChanges = document.getElementById("reviewTimeChanges");
    const reviewNote = document.getElementById("reviewNote");

    const renderReviewList = (listElement, items, emptyText) => {
        if (!listElement) return;
        const cleanItems = Array.isArray(items) ? items.filter(Boolean) : [];
        listElement.innerHTML = cleanItems.length
            ? cleanItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
            : `<li>${escapeHtml(emptyText)}</li>`;
    };

    const renderDailyReview = (review) => {
        if (!review || !dailyReviewOutput) return;
        dailyReviewOutput.classList.remove("hidden");
        if (dailyReviewLoading) dailyReviewLoading.classList.add("hidden");
        if (dailyReviewResult) dailyReviewResult.classList.remove("hidden");
        if (reviewSummary) reviewSummary.textContent = review.summary || "No summary available yet.";
        renderReviewList(reviewRecommendations, review.recommendations, "Keep tomorrow simple: choose one meaningful habit and protect the first step.");
        renderReviewList(reviewTimeChanges, review.suggestedTimeChanges, "No timing changes needed yet.");
        if (reviewNote) reviewNote.textContent = review.motivationalNote || "Reset, refine, and keep going tomorrow.";

        if (reviewWins) reviewWins.value = review.wins || "";
        if (reviewBlockers) reviewBlockers.value = review.blockers || "";
        if (reviewEnergy) reviewEnergy.value = review.energyLevel || "medium";
        if (reviewPriority) reviewPriority.value = review.tomorrowPriority || "";
    };

    const setDailyReviewLoading = (isLoading) => {
        if (!dailyReviewOutput) return;
        dailyReviewOutput.classList.remove("hidden");
        if (dailyReviewLoading) dailyReviewLoading.classList.toggle("hidden", !isLoading);
        if (dailyReviewResult) dailyReviewResult.classList.toggle("hidden", isLoading);
        if (dailyReviewBtn) {
            dailyReviewBtn.disabled = isLoading;
            dailyReviewBtn.textContent = isLoading ? "Generating..." : "Generate Review";
        }
    };

    const loadDailyReview = async () => {
        if (!dailyReviewForm || !token) return;
        try {
            const res = await fetch("/api/reviews/today", {
                headers: authHeaders()
            });
            if (checkUnauthorized(res)) return;
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load daily review.");
            if (data.review) renderDailyReview(data.review);
        } catch (error) {
            if (dailyReviewError) dailyReviewError.textContent = `Warning: ${error.message}`;
        }
    };

    if (dailyReviewForm) {
        dailyReviewForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (dailyReviewError) dailyReviewError.textContent = "";

            const payload = {
                wins: reviewWins?.value.trim() || "",
                blockers: reviewBlockers?.value.trim() || "",
                energyLevel: reviewEnergy?.value || "medium",
                tomorrowPriority: reviewPriority?.value.trim() || ""
            };

            if (!payload.wins && !payload.blockers && !payload.tomorrowPriority) {
                if (dailyReviewError) dailyReviewError.textContent = "Warning: Add at least one reflection detail.";
                return;
            }

            setDailyReviewLoading(true);
            let shouldHideReviewAfterError = false;

            try {
                const res = await fetch("/api/reviews", {
                    method: "POST",
                    headers: authHeaders(true),
                    body: JSON.stringify(payload)
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to generate daily review.");
                renderDailyReview(data.review);
            } catch (error) {
                if (dailyReviewError) dailyReviewError.textContent = `Warning: ${error.message}`;
                if (dailyReviewOutput && !reviewSummary?.textContent) {
                    shouldHideReviewAfterError = true;
                }
            } finally {
                setDailyReviewLoading(false);
                if (shouldHideReviewAfterError && dailyReviewOutput) {
                    dailyReviewOutput.classList.add("hidden");
                }
            }
        });

        loadDailyReview();
    }

    // Settings logic
    const settingsForm = document.getElementById("settingsForm");
    const passwordForm = document.getElementById("passwordForm");
    const settingsStatus = document.getElementById("settingsStatus");
    const settingsSaveBtn = document.getElementById("settingsSaveBtn");
    const passwordSaveBtn = document.getElementById("passwordSaveBtn");
    const exportDataBtn = document.getElementById("exportDataBtn");
    const deleteAllHabitsBtn = document.getElementById("deleteAllHabitsBtn");
    const deleteAccountBtn = document.getElementById("deleteAccountBtn");
    const dailyReviewPanel = document.querySelector(".daily-review-panel");
    const settingIds = {
        name: document.getElementById("settingsName"),
        email: document.getElementById("settingsEmail"),
        timezone: document.getElementById("settingsTimezone"),
        coachingStyle: document.getElementById("settingsCoachingStyle"),
        recommendationIntensity: document.getElementById("settingsRecommendationIntensity"),
        dailyCheckInTime: document.getElementById("settingsDailyCheckInTime"),
        morningBriefing: document.getElementById("notifyMorningBriefing"),
        eveningReview: document.getElementById("notifyEveningReview"),
        missedHabitReminders: document.getElementById("notifyMissedHabitReminders"),
        weeklyProgressReport: document.getElementById("notifyWeeklyProgressReport"),
        defaultDifficulty: document.getElementById("defaultDifficulty"),
        defaultTimeOfDay: document.getElementById("defaultTimeOfDay"),
        defaultFrequencyPreset: document.getElementById("defaultFrequencyPreset"),
        startPage: document.getElementById("settingsStartPage"),
        showDailyReview: document.getElementById("showDailyReview"),
        showEnergyMatch: document.getElementById("showEnergyMatch"),
        compactMode: document.getElementById("compactMode"),
        theme: document.getElementById("settingsTheme")
    };
    const focusInputs = ["productivity", "health", "learning", "fitness"]
        .map((area) => document.querySelector(`#settingsView input[value='${area}']`))
        .filter(Boolean);
    const customFrequencyInputs = [...document.querySelectorAll("#defaultCustomFrequency input[type='checkbox']")];

    const AVAILABLE_BADGES = [
        { id: "first-habit", label: "First Habit", icon: "🏆", desc: "First habit completed" },
        { id: "streak-3", label: "3-Day Streak", icon: "🔥", desc: "Keep moving for 3 days" },
        { id: "streak-7", label: "7-Day Streak", icon: "⚡", desc: "Perfect week streak" },
        { id: "streak-30", label: "30-Day Grit", icon: "🚀", desc: "30 days of commitment" },
        { id: "level-5", label: "Level 5", icon: "👑", desc: "Reach profile level 5" },
        { id: "perfect-day", label: "Perfect Day", icon: "🌟", desc: "Complete all habits in a day" }
    ];

    const showLevelUpToast = (level, badgeUnlockedName = null) => {
        const existing = document.getElementById("levelUpToast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "levelUpToast";
        toast.className = "level-up-toast";
        
        let icon = "🎉";
        let title = "Level Up!";
        let text = `You reached Level ${level}! +1 Streak Freeze earned.`;

        if (badgeUnlockedName) {
            icon = "🏆";
            title = "Badge Unlocked!";
            text = `Congratulations! You unlocked the "${badgeUnlockedName}" badge.`;
        }

        toast.innerHTML = `
            <div class="level-up-icon">${icon}</div>
            <div class="level-up-content">
                <h4>${title}</h4>
                <p>${text}</p>
            </div>
        `;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add("active"), 50);

        setTimeout(() => {
            toast.classList.remove("active");
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    const renderGamification = (data) => {
        if (!data) return;
        
        const userLevelBadge = document.getElementById("userLevelBadge");
        const userXpFill = document.getElementById("userXpFill");
        const userXpText = document.getElementById("userXpText");
        const userStreakFreezesDisplay = document.getElementById("userStreakFreezesDisplay");

        if (userLevelBadge) {
            const nextLevel = data.level || 1;
            const currentLevel = Number((userLevelBadge.textContent || "").match(/\d+/)?.[0] || nextLevel);
            userLevelBadge.textContent = `Level ${nextLevel}`;
            if (nextLevel !== currentLevel) {
                userLevelBadge.classList.remove("level-pulse");
                requestAnimationFrame(() => userLevelBadge.classList.add("level-pulse"));
            }
        }
        if (userXpFill && userXpText) {
            const currentXp = data.xp || 0;
            const level = data.level || 1;
            const nextLevelXp = level * 100;
            const pct = Math.min(100, Math.max(0, (currentXp / nextLevelXp) * 100));
            const previousXp = Number((userXpText.textContent || "0").split("/")[0].trim()) || 0;
            userXpFill.style.width = `${pct}%`;
            userXpFill.classList.remove("xp-pulse");
            requestAnimationFrame(() => userXpFill.classList.add("xp-pulse"));

            const duration = 520;
            const start = performance.now();
            const animateXp = (now) => {
                const progress = Math.min(1, (now - start) / duration);
                const eased = 1 - Math.pow(1 - progress, 3);
                const value = Math.round(previousXp + (currentXp - previousXp) * eased);
                userXpText.textContent = `${value} / ${nextLevelXp} XP`;
                if (progress < 1) requestAnimationFrame(animateXp);
            };
            requestAnimationFrame(animateXp);
        }
        if (userStreakFreezesDisplay) {
            userStreakFreezesDisplay.textContent = data.streakFreezes || 0;
        }

        const badgesDisplayGrid = document.getElementById("badgesDisplayGrid");
        if (badgesDisplayGrid) {
            const unlocked = new Set(data.badges || []);
            badgesDisplayGrid.innerHTML = AVAILABLE_BADGES.map(badge => {
                const isUnlocked = unlocked.has(badge.id);
                return `
                    <div class="badge-item ${isUnlocked ? 'unlocked' : ''}" title="${badge.desc}">
                        <div class="badge-icon">${badge.icon}</div>
                        <div class="badge-label">${badge.label}</div>
                        <div class="badge-desc">${isUnlocked ? 'Unlocked' : 'Locked'}</div>
                    </div>
                `;
            }).join("");
        }
    };

    const deepMergeSettings = (incoming = {}) => {
        if (incoming.xp !== undefined) {
            renderGamification(incoming);
        }
        return {
            profile: {
                ...defaultSettings.profile,
                ...(incoming.profile || {})
            },
            settings: {
                aiCoach: {
                    ...defaultSettings.settings.aiCoach,
                    ...(incoming.settings?.aiCoach || {})
                },
                notifications: {
                    ...defaultSettings.settings.notifications,
                    ...(incoming.settings?.notifications || {})
                },
                habitDefaults: {
                    ...defaultSettings.settings.habitDefaults,
                    ...(incoming.settings?.habitDefaults || {})
                },
                dashboard: {
                    ...defaultSettings.settings.dashboard,
                    ...(incoming.settings?.dashboard || {})
                }
            },
            xp: incoming.xp || 0,
            level: incoming.level || 1,
            streakFreezes: incoming.streakFreezes || 0,
            frozenDates: incoming.frozenDates || [],
            badges: incoming.badges || []
        };
    };

    const setSettingsStatus = (message = "", isError = false, show = false) => {
        if (!settingsStatus) return;
        settingsStatus.textContent = message;
        settingsStatus.classList.toggle("hidden", !show);
        settingsStatus.classList.toggle("progress-error", isError);
    };

    const applyDashboardPreferences = () => {
        const dashboardSettings = userSettings.settings.dashboard;
        if (dailyReviewPanel) dailyReviewPanel.classList.toggle("hidden", !dashboardSettings.showDailyReview);
        if (document.querySelector(".energy-match")) {
            document.querySelector(".energy-match").classList.toggle("hidden", !dashboardSettings.showEnergyMatch);
        }
        if (appContainer) appContainer.classList.toggle("app-compact", Boolean(dashboardSettings.compactMode));

        // Apply Color Theme
        const currentTheme = dashboardSettings.theme || "light";
        document.documentElement.setAttribute("data-theme", currentTheme);

        localStorage.setItem("startPage", dashboardSettings.startPage || "dashboard");
    };

    const applyHabitDefaults = () => {
        const defaults = userSettings.settings.habitDefaults;
        const habitDifficulty = document.getElementById("habitDifficulty");
        if (habitDifficulty) habitDifficulty.value = normalizeDifficultyValue(defaults.difficulty);
    };

    const populateSettingsForm = () => {
        if (!settingsForm) return;
        const { profile, settings } = userSettings;
        if (settingIds.name) settingIds.name.value = profile.name || "";
        if (settingIds.email) settingIds.email.value = profile.email || "";
        if (settingIds.timezone) settingIds.timezone.value = profile.timezone || userTimeZone;
        if (settingIds.coachingStyle) settingIds.coachingStyle.value = settings.aiCoach.coachingStyle;
        if (settingIds.recommendationIntensity) settingIds.recommendationIntensity.value = settings.aiCoach.recommendationIntensity;
        if (settingIds.dailyCheckInTime) settingIds.dailyCheckInTime.value = settings.aiCoach.dailyCheckInTime;
        focusInputs.forEach((input) => {
            input.checked = settings.aiCoach.focusAreas.includes(input.value);
        });
        if (settingIds.morningBriefing) settingIds.morningBriefing.checked = settings.notifications.morningBriefing;
        if (settingIds.eveningReview) settingIds.eveningReview.checked = settings.notifications.eveningReview;
        if (settingIds.missedHabitReminders) settingIds.missedHabitReminders.checked = settings.notifications.missedHabitReminders;
        if (settingIds.weeklyProgressReport) settingIds.weeklyProgressReport.checked = settings.notifications.weeklyProgressReport;
        if (settingIds.defaultDifficulty) settingIds.defaultDifficulty.value = settings.habitDefaults.difficulty;
        if (settingIds.defaultTimeOfDay) settingIds.defaultTimeOfDay.value = settings.habitDefaults.timeOfDay;
        if (settingIds.defaultFrequencyPreset) settingIds.defaultFrequencyPreset.value = settings.habitDefaults.frequencyPreset;
        customFrequencyInputs.forEach((input) => {
            input.checked = settings.habitDefaults.customFrequency.includes(Number(input.value));
        });
        if (settingIds.startPage) settingIds.startPage.value = settings.dashboard.startPage;
        if (settingIds.showDailyReview) settingIds.showDailyReview.checked = settings.dashboard.showDailyReview;
        if (settingIds.showEnergyMatch) settingIds.showEnergyMatch.checked = settings.dashboard.showEnergyMatch;
        if (settingIds.compactMode) settingIds.compactMode.checked = settings.dashboard.compactMode;
        if (settingIds.theme) settingIds.theme.value = settings.dashboard.theme || "light";
    };

    const collectSettingsPayload = () => {
        const selectedFocusAreas = focusInputs.filter((input) => input.checked).map((input) => input.value);
        const selectedCustomFrequency = customFrequencyInputs.filter((input) => input.checked).map((input) => Number(input.value));
        const selectedFrequencyPreset = settingIds.defaultFrequencyPreset?.value || "everyday";
        const presetDays = selectedFrequencyPreset === "weekdays"
            ? [1, 2, 3, 4, 5]
            : selectedFrequencyPreset === "everyday"
                ? [0, 1, 2, 3, 4, 5, 6]
                : selectedCustomFrequency;
        const cleanCustomFrequency = selectedCustomFrequency.length ? selectedCustomFrequency : [1, 2, 3, 4, 5];
        const selectedDaysKey = cleanCustomFrequency.slice().sort((a, b) => a - b).join(",");
        const presetDaysKey = presetDays.slice().sort((a, b) => a - b).join(",");
        const resolvedFrequencyPreset = selectedDaysKey === presetDaysKey ? selectedFrequencyPreset : "custom";
        return {
            profile: {
                name: settingIds.name?.value.trim() || "",
                email: settingIds.email?.value.trim() || "",
                timezone: settingIds.timezone?.value.trim() || userTimeZone
            },
            settings: {
                aiCoach: {
                    coachingStyle: settingIds.coachingStyle?.value || "balanced",
                    focusAreas: selectedFocusAreas.length ? selectedFocusAreas : ["productivity"],
                    dailyCheckInTime: settingIds.dailyCheckInTime?.value || "18:00",
                    recommendationIntensity: settingIds.recommendationIntensity?.value || "normal"
                },
                notifications: {
                    morningBriefing: Boolean(settingIds.morningBriefing?.checked),
                    eveningReview: Boolean(settingIds.eveningReview?.checked),
                    missedHabitReminders: Boolean(settingIds.missedHabitReminders?.checked),
                    weeklyProgressReport: Boolean(settingIds.weeklyProgressReport?.checked)
                },
                habitDefaults: {
                    difficulty: settingIds.defaultDifficulty?.value || "medium",
                    timeOfDay: settingIds.defaultTimeOfDay?.value || "Morning",
                    frequencyPreset: resolvedFrequencyPreset,
                    customFrequency: cleanCustomFrequency
                },
                dashboard: {
                    startPage: settingIds.startPage?.value || "dashboard",
                    showDailyReview: Boolean(settingIds.showDailyReview?.checked),
                    showEnergyMatch: Boolean(settingIds.showEnergyMatch?.checked),
                    compactMode: Boolean(settingIds.compactMode?.checked),
                    theme: settingIds.theme?.value || "light"
                }
            }
        };
    };

    const syncUserDisplayFromSettings = () => {
        const userNameDisplay = document.getElementById("userNameDisplay");
        const userAvatar = document.getElementById("userAvatar");
        const displayName = userSettings.profile.name || "User";
        if (userNameDisplay) userNameDisplay.textContent = displayName;
        if (userAvatar) {
            userAvatar.textContent = displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join("") || "HC";
        }
    };

    const loadSettings = async () => {
        if (!settingsForm || !token) return;
        try {
            const res = await fetch("/api/settings", { headers: authHeaders() });
            if (checkUnauthorized(res)) return;
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load settings.");
            userSettings = deepMergeSettings(data);
            populateSettingsForm();
            applyDashboardPreferences();
            applyHabitDefaults();
            syncUserDisplayFromSettings();
            const startPage = userSettings.settings.dashboard.startPage;
            const activeView = document.querySelector(".nav-item.active")?.dataset.view;
            if (activeView === "dashboard" && views[startPage]) {
                await setActiveView(startPage);
            }
        } catch (error) {
            setSettingsStatus(`Warning: ${error.message}`, true, true);
        }
    };

    if (settingsForm) {
        settingsForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            setSettingsStatus("", false, false);
            if (settingsSaveBtn) {
                settingsSaveBtn.disabled = true;
                settingsSaveBtn.textContent = "Saving...";
            }
            try {
                const res = await fetch("/api/settings", {
                    method: "PUT",
                    headers: authHeaders(true),
                    body: JSON.stringify(collectSettingsPayload())
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to save settings.");
                userSettings = deepMergeSettings(data);
                populateSettingsForm();
                applyDashboardPreferences();
                applyHabitDefaults();
                syncUserDisplayFromSettings();
                if (typeof refreshHabits === "function") await refreshHabits();
                const activeView = document.querySelector(".nav-item.active")?.dataset.view;
                if (activeView === "progress") await loadProgress(activePeriod);
                setSettingsStatus("Settings saved.", false, true);
            } catch (error) {
                setSettingsStatus(`Warning: ${error.message}`, true, true);
            } finally {
                if (settingsSaveBtn) {
                    settingsSaveBtn.disabled = false;
                    settingsSaveBtn.textContent = "Save Settings";
                }
            }
        });
        const buyStreakFreezeBtn = document.getElementById("buyStreakFreezeBtn");
        if (buyStreakFreezeBtn) {
            buyStreakFreezeBtn.addEventListener("click", async () => {
                buyStreakFreezeBtn.disabled = true;
                try {
                    const res = await fetch("/api/settings/buy-freeze", {
                        method: "POST",
                        headers: authHeaders()
                    });
                    if (checkUnauthorized(res)) return;
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Failed to purchase Streak Freeze");

                    userSettings = deepMergeSettings(data);
                    showToast("Successfully purchased 1 Streak Freeze.");
                } catch (err) {
                    showToast(err.message || "Failed to purchase Streak Freeze", "error");
                } finally {
                    buyStreakFreezeBtn.disabled = false;
                }
            });
        }

        loadSettings();
    }

    const freezeDayBtn = document.getElementById("freezeDayBtn");
    if (freezeDayBtn) {
        freezeDayBtn.addEventListener("click", async () => {
            if (userSettings.streakFreezes <= 0) {
                showToast("No Streak Freezes left. Buy one from Settings first.", "error");
                return;
            }
            
            const confirmed = confirm(`Are you sure you want to use a Streak Freeze for ${formatViewingDate(selectedDate)}? This will keep your streak active.`);
            if (!confirmed) return;

            freezeDayBtn.disabled = true;
            try {
                const res = await fetch("/api/settings/apply-freeze", {
                    method: "POST",
                    headers: authHeaders(true),
                    body: JSON.stringify({ date: selectedDate })
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to apply Streak Freeze");

                userSettings = deepMergeSettings(data);
                syncDateNavigationUI();
                showToast("Day successfully frozen.");
                if (typeof refreshHabits === "function") {
                    await refreshHabits();
                }
            } catch (err) {
                showToast(err.message || "Failed to apply Streak Freeze", "error");
            } finally {
                freezeDayBtn.disabled = false;
            }
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const currentPassword = document.getElementById("currentPassword")?.value || "";
            const newPassword = document.getElementById("newPassword")?.value || "";
            setSettingsStatus("", false, false);
            if (passwordSaveBtn) {
                passwordSaveBtn.disabled = true;
                passwordSaveBtn.textContent = "Updating...";
            }
            try {
                const res = await fetch("/api/settings/password", {
                    method: "PUT",
                    headers: authHeaders(true),
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to update password.");
                passwordForm.reset();
                setSettingsStatus("Password updated.", false, true);
            } catch (error) {
                setSettingsStatus(`Warning: ${error.message}`, true, true);
            } finally {
                if (passwordSaveBtn) {
                    passwordSaveBtn.disabled = false;
                    passwordSaveBtn.textContent = "Update Password";
                }
            }
        });
    }

    if (exportDataBtn) {
        exportDataBtn.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/settings/export", { headers: authHeaders() });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to export data.");
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `habitcoach-export-${getTodayDate()}.json`;
                link.click();
                URL.revokeObjectURL(url);
                setSettingsStatus("Export ready.", false, true);
            } catch (error) {
                setSettingsStatus(`Warning: ${error.message}`, true, true);
            }
        });
    }

    if (deleteAllHabitsBtn) {
        deleteAllHabitsBtn.addEventListener("click", async () => {
            if (!confirm("Delete all habits permanently? This cannot be undone.")) return;
            try {
                const res = await fetch("/api/settings/habits", {
                    method: "DELETE",
                    headers: authHeaders()
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to delete habits.");
                if (typeof refreshHabits === "function") await refreshHabits();
                setSettingsStatus(`Deleted ${data.deletedCount || 0} habits.`, false, true);
            } catch (error) {
                setSettingsStatus(`Warning: ${error.message}`, true, true);
            }
        });
    }

    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener("click", async () => {
            const password = document.getElementById("deleteAccountPassword")?.value || "";
            if (!password) {
                setSettingsStatus("Warning: Enter your password to delete your account.", true, true);
                return;
            }
            if (!confirm("Delete your account and all related data permanently? This cannot be undone.")) return;
            try {
                const res = await fetch("/api/settings/account", {
                    method: "DELETE",
                    headers: authHeaders(true),
                    body: JSON.stringify({ password })
                });
                if (checkUnauthorized(res)) return;
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to delete account.");
                localStorage.removeItem("token");
                window.location.href = "signup.html";
            } catch (error) {
                setSettingsStatus(`Warning: ${error.message}`, true, true);
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
                updateDashboardStats(habits);
                renderEnergyRecommendations(habits);
                renderHabits(habits);
                renderPlanning(habits);
            } catch (err) {
                if (habitErrorText) habitErrorText.textContent = "Warning: Failed to fetch habits.";
            }
        };
        refreshHabits = fetchHabits;

        renderHabits = (habits) => {
            habitsList.innerHTML = "";
            const selectedDayIndex = getDayIndexFromDate(selectedDate);
            const selectedDayHabits = habits.filter((habit) => isHabitScheduledForDay(habit, selectedDayIndex));

            if (selectedDayHabits.length === 0) {
                habitsList.innerHTML = "<p class='empty-state'>Free day — no habits scheduled.</p>";
                return;
            }

            selectedDayHabits.forEach((habit) => {
                const card = document.createElement("div");
                const { displayStatus, isLocked, statusLabel, dateKey, readOnlyMode } = getHabitDisplayState(habit, selectedDate);
                const isCompleted = displayStatus === "completed";
                const actionType = isCompleted ? "undo" : "complete";
                const actionLabel = isCompleted ? "Undo to pending" : "Mark as completed";
                const actionSymbol = isCompleted ? "&#8634;" : "&#10003;";
                const nextStatus = isCompleted ? "pending" : "completed";
                card.className = `habit-card ${isCompleted ? "completed" : ""} ${displayStatus === "missed" ? "missed" : ""}`;
                card.style.cssText = readOnlyMode ? "opacity: 0.72; filter: grayscale(0.15);" : "";

                const safeTitle = escapeHtml(formatHabitTitle(habit.title));
                const safeDesc = habit.description ? escapeHtml(habit.description) : "";
                const difficulty = normalizeDifficultyValue(habit.difficulty);
                const difficultyLabel = escapeHtml(formatDifficulty(difficulty));

                card.innerHTML = `
                    <div class="habit-info">
                        <h3>${safeTitle} <span class="status-badge status-${displayStatus}">${statusLabel}</span> <span class="difficulty-badge difficulty-${difficulty}">${difficultyLabel}</span></h3>
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
                            data-dashboard-action="toggle-status"
                            data-habit-id="${habit._id}"
                            data-next-status="${nextStatus}"
                            data-date="${dateKey}"
                            ${isLocked ? "disabled" : ""}
                        >${actionSymbol}</button>
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
            updateDashboardStats(allHabits);
            renderEnergyRecommendations(allHabits);
            renderHabits(allHabits);
            renderPlanning(allHabits);
        };

        const removeHabitFromState = (habitId) => {
            allHabits = allHabits.filter((habit) => habit._id !== habitId);
            hiddenFromTimeBlocking.delete(habitId);
            updateDashboardStats(allHabits);
            renderEnergyRecommendations(allHabits);
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
                if (data.habit) {
                    upsertHabitInState(data.habit);
                    if (data.gamification) {
                        renderGamification(data.gamification);
                        userSettings.xp = data.gamification.xp;
                        userSettings.level = data.gamification.level;
                        userSettings.streakFreezes = data.gamification.streakFreezes;
                        userSettings.frozenDates = data.gamification.frozenDates;
                        userSettings.badges = data.gamification.badges;
                        
                        if (data.levelUp) {
                            showLevelUpToast(data.gamification.level);
                        }
                        if (data.gamification.newlyUnlockedBadges && data.gamification.newlyUnlockedBadges.length > 0) {
                            data.gamification.newlyUnlockedBadges.forEach(badgeId => {
                                const found = AVAILABLE_BADGES.find(b => b.id === badgeId);
                                if (found) {
                                    showLevelUpToast(null, found.label);
                                }
                            });
                        }
                    }
                } else {
                    upsertHabitInState(data);
                }

                if (nextStatus === "completed") {
                    requestAnimationFrame(() => {
                        const completedCard = document.querySelector(`.habit-card [data-habit-id="${habitId}"]`)?.closest(".habit-card");
                        if (completedCard) {
                            completedCard.classList.add("habit-complete-burst");
                            setTimeout(() => completedCard.classList.remove("habit-complete-burst"), 900);
                        }
                    });
                    const todayIndex = getDayIndexFromDate(selectedDate);
                    const scheduledToday = allHabits.filter((habit) => isHabitScheduledForDay(habit, todayIndex));
                    if (scheduledToday.length > 0) {
                        const allCompleted = scheduledToday.every((habit) => {
                            const { displayStatus } = getHabitDisplayState(habit, selectedDate);
                            return displayStatus === "completed";
                        });
                        if (allCompleted && typeof confetti === "function") {
                            confetti({
                                particleCount: 150,
                                spread: 80,
                                origin: { y: 0.6 }
                            });
                        }
                    }
                }
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
            if (!confirm("Are you sure you want to delete this habit permanently?")) return false;
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
                return true;
            } catch (err) {
                if (habitErrorText) habitErrorText.textContent = "Warning: Server error deleting habit.";
                btnElement.disabled = false;
                btnElement.innerHTML = originalHTML;
                return false;
            }
        };

        if (habitsList) {
            habitsList.addEventListener("click", async (event) => {
                const deleteButton = event.target.closest("[data-dashboard-action='delete-db']");
                if (deleteButton) {
                    const habitId = deleteButton.dataset.habitId;
                    if (habitId) {
                        await deleteHabitFromDB(habitId, deleteButton);
                    }
                    return;
                }

                const statusButton = event.target.closest("[data-dashboard-action='toggle-status']");
                if (statusButton) {
                    const habitId = statusButton.dataset.habitId;
                    const nextStatus = statusButton.dataset.nextStatus;
                    const dateKey = statusButton.dataset.date || getTodayDate();
                    if (habitId && nextStatus) {
                        await updateHabitStatus(habitId, nextStatus, dateKey, statusButton);
                    }
                }
            });
        }

        if (planningModalDelete) {
            planningModalDelete.addEventListener("click", async () => {
                if (!selectedPlanningHabitId) return;
                const deleted = await deleteHabitFromDB(selectedPlanningHabitId, planningModalDelete);
                if (deleted) closePlanningModal();
            });
        }

        if (planningSection) {
            // Event delegation avoids duplicate listeners when Planning cards are re-rendered.
            planningSection.addEventListener("click", async (event) => {
                const filterBtn = event.target.closest("[data-weekly-filter]");
                if (filterBtn) {
                    weeklyArchitectFilter = filterBtn.dataset.weeklyFilter || "all";
                    localStorage.setItem("weeklyArchitectFilter", weeklyArchitectFilter);
                    renderWeeklyArchitect(getPlanningScopeHabits(allHabits));
                    return;
                }

                const actionBtn = event.target.closest("[data-planning-action]");
                if (actionBtn) {
                    const action = actionBtn.dataset.planningAction;
                    const habitId = actionBtn.dataset.habitId;
                    const dayIndex = Number(actionBtn.dataset.dayIndex);

                    if (action === "toggle-day") {
                        if (collapsedWeeklyDays.has(dayIndex)) {
                            collapsedWeeklyDays.delete(dayIndex);
                        } else {
                            collapsedWeeklyDays.add(dayIndex);
                        }
                        renderWeeklyArchitect(allHabits);
                        return;
                    }

                    if (action === "add-day") {
                        await startAddHabitForDay(Number.isInteger(dayIndex) ? dayIndex : getDayIndexFromDate(selectedDate));
                        return;
                    }

                    if (action === "open-duos") {
                        await setActiveView("social");
                        return;
                    }

                    if (!habitId) return;

                    if (action === "edit") {
                        openPlanningModal(habitId);
                        return;
                    }

                    if (action === "remove-day") {
                        await removeHabitFromDay(habitId, dayIndex, actionBtn);
                        return;
                    }

                    if (action === "duplicate-day") {
                        await duplicateHabitToNextDay(habitId, dayIndex, actionBtn);
                        return;
                    }

                    if (action === "move-time") {
                        await moveHabitToTimeBlock(habitId, actionBtn.dataset.timeBlock, actionBtn);
                        return;
                    }

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

            planningSection.addEventListener("dragstart", (event) => {
                const draggable = event.target.closest(".habit-badge, .time-block-habit");
                if (!draggable) return;
                const dragData = {
                    habitId: draggable.dataset.habitId,
                    sourceDayIndex: draggable.dataset.sourceDayIndex ?? "",
                    sourceTimeBlock: draggable.dataset.timeBlock ?? ""
                };
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/json", JSON.stringify(dragData));
                draggable.classList.add("is-dragging");
            });

            planningSection.addEventListener("dragend", () => {
                planningSection.querySelectorAll(".is-dragging, .drag-over").forEach((el) => {
                    el.classList.remove("is-dragging", "drag-over");
                });
            });

            planningSection.addEventListener("dragover", (event) => {
                const dropTarget = event.target.closest(".weekly-day-card[data-day-index], .time-block-card[data-time-block]");
                if (!dropTarget) return;
                event.preventDefault();
                dropTarget.classList.add("drag-over");
            });

            planningSection.addEventListener("dragleave", (event) => {
                const dropTarget = event.target.closest(".weekly-day-card[data-day-index], .time-block-card[data-time-block]");
                if (!dropTarget || dropTarget.contains(event.relatedTarget)) return;
                dropTarget.classList.remove("drag-over");
            });

            planningSection.addEventListener("drop", async (event) => {
                const dropTarget = event.target.closest(".weekly-day-card[data-day-index], .time-block-card[data-time-block]");
                if (!dropTarget) return;
                event.preventDefault();
                dropTarget.classList.remove("drag-over");

                let dragData = {};
                try {
                    dragData = JSON.parse(event.dataTransfer.getData("application/json") || "{}");
                } catch {
                    dragData = {};
                }
                if (!dragData.habitId) return;

                if (dropTarget.dataset.dayIndex !== undefined) {
                    const targetDayIndex = Number(dropTarget.dataset.dayIndex);
                    const hasSourceDay = dragData.sourceDayIndex !== "" && dragData.sourceDayIndex !== undefined;
                    const sourceDayIndex = Number(dragData.sourceDayIndex);
                    if (hasSourceDay && Number.isInteger(sourceDayIndex)) {
                        await moveHabitToDay(dragData.habitId, sourceDayIndex, targetDayIndex);
                    } else {
                        await addHabitToDay(dragData.habitId, targetDayIndex);
                    }
                    return;
                }

                if (dropTarget.dataset.timeBlock) {
                    await moveHabitToTimeBlock(dragData.habitId, dropTarget.dataset.timeBlock);
                }
            });
        }

        if (timeBlockingScopeToggle) {
            timeBlockingScopeToggle.addEventListener("click", (event) => {
                const btn = event.target.closest("[data-time-scope]");
                if (!btn) return;
                timeBlockingScope = btn.dataset.timeScope === "week" ? "week" : "today";
                localStorage.setItem("timeBlockingScope", timeBlockingScope);
                renderTimeBlocking(getPlanningScopeHabits(allHabits));
            });
        }

        if (timeBlockingCompactToggle) {
            timeBlockingCompactToggle.addEventListener("click", () => {
                timeBlockingCompact = !timeBlockingCompact;
                localStorage.setItem("timeBlockingCompact", String(timeBlockingCompact));
                renderTimeBlocking(getPlanningScopeHabits(allHabits));
            });
        }

        addHabitForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("habitTitle");
            const descInput = document.getElementById("habitDesc");
            const difficultyInput = document.getElementById("habitDifficulty");
            const titleVal = titleInput.value.trim();
            const descVal = descInput.value.trim();
            const difficultyVal = normalizeDifficultyValue(difficultyInput?.value);
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
                    body: JSON.stringify({
                        title: titleVal,
                        description: descVal,
                        difficulty: difficultyVal,
                        timeOfDay: userSettings.settings.habitDefaults.timeOfDay,
                        frequency: getDefaultFrequencyDays(),
                    })
                });

                if (checkUnauthorized(res)) return;

                if (res.ok) {
                    titleInput.value = "";
                    descInput.value = "";
                    if (difficultyInput) difficultyInput.value = "medium";
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
    const dailyCountdownCard = document.getElementById("dailyCountdownCard");
    const dailyCountdownHours = document.getElementById("dailyCountdownHours");
    const dailyCountdownMinutes = document.getElementById("dailyCountdownMinutes");
    const dailyCountdownSeconds = document.getElementById("dailyCountdownSeconds");
    const dailyCountdownMessage = document.getElementById("dailyCountdownMessage");
    const dailyCountdownBar = document.getElementById("dailyCountdownBar");
    const dailyCountdownRing = document.getElementById("dailyCountdownRing");
    const dailyCountdownPercent = document.getElementById("dailyCountdownPercent");
    let dailyCountdownInterval = null;
    const chartTheme = {
        text: "#f8fbff",
        muted: "#9fb2cc",
        panel: "rgba(8, 13, 28, 0.96)",
        grid: "rgba(148, 163, 184, 0.18)",
        border: "rgba(8, 13, 28, 0.9)"
    };

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
            ctx.fillStyle = chartTheme.text;
            ctx.font = "700 1.5rem Inter, sans-serif";
            ctx.fillText(text, centerX, centerY - 4);
            ctx.fillStyle = chartTheme.muted;
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

    const getDailyCountdownState = () => {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const totalMs = endOfDay - startOfDay;
        const remainingMs = Math.max(0, endOfDay - now);
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const remainingPercent = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;

        let urgency = "green";
        let message = "Still enough time to finish strong";
        if (remainingMs < 2 * 60 * 60 * 1000) {
            urgency = "red";
            message = "Final push for today";
        } else if (remainingMs < 6 * 60 * 60 * 1000) {
            urgency = "yellow";
            message = "Prioritize the smallest useful wins";
        } else if (remainingMs <= 12 * 60 * 60 * 1000) {
            urgency = "yellow";
            message = "Plenty of runway, choose your next block";
        }

        return { hours, minutes, seconds, remainingPercent, urgency, message };
    };

    const updateDailyCountdown = () => {
        if (!dailyCountdownCard) return;
        const scheduledToday = allHabits.filter((habit) => isHabitScheduledForDay(habit, getDayIndexFromDate(getTodayDate())));
        if (scheduledToday.length === 0) {
            if (dailyCountdownHours) dailyCountdownHours.textContent = "00";
            if (dailyCountdownMinutes) dailyCountdownMinutes.textContent = "00";
            if (dailyCountdownSeconds) dailyCountdownSeconds.textContent = "00";
            if (dailyCountdownMessage) dailyCountdownMessage.textContent = "Free day today — no habits due.";
            dailyCountdownCard.classList.add("countdown-free");
            dailyCountdownCard.classList.remove("countdown-yellow", "countdown-red");
            dailyCountdownCard.classList.add("countdown-green");
            if (dailyCountdownBar) dailyCountdownBar.style.transform = "scaleX(1)";
            if (dailyCountdownRing) dailyCountdownRing.style.strokeDashoffset = "0";
            if (dailyCountdownPercent) dailyCountdownPercent.textContent = "Free";
            return;
        }

        const state = getDailyCountdownState();
        const pad = (value) => String(value).padStart(2, "0");
        if (dailyCountdownHours) dailyCountdownHours.textContent = pad(state.hours);
        if (dailyCountdownMinutes) dailyCountdownMinutes.textContent = pad(state.minutes);
        if (dailyCountdownSeconds) dailyCountdownSeconds.textContent = pad(state.seconds);
        if (dailyCountdownMessage) dailyCountdownMessage.textContent = state.message;

        dailyCountdownCard.classList.remove("countdown-free");
        dailyCountdownCard.classList.toggle("countdown-green", state.urgency === "green");
        dailyCountdownCard.classList.toggle("countdown-yellow", state.urgency === "yellow");
        dailyCountdownCard.classList.toggle("countdown-red", state.urgency === "red");

        if (dailyCountdownBar) {
            dailyCountdownBar.style.transform = `scaleX(${state.remainingPercent / 100})`;
        }
        if (dailyCountdownRing) {
            const circumference = 326.73;
            dailyCountdownRing.style.strokeDashoffset = String(circumference * (1 - state.remainingPercent / 100));
        }
        if (dailyCountdownPercent) {
            dailyCountdownPercent.textContent = `${Math.round(state.remainingPercent)}%`;
        }
    };

    const startDailyCountdown = () => {
        if (!dailyCountdownCard || dailyCountdownInterval) return;
        updateDailyCountdown();
        dailyCountdownInterval = window.setInterval(updateDailyCountdown, 1000);
    };

    const stopDailyCountdown = () => {
        if (!dailyCountdownInterval) return;
        window.clearInterval(dailyCountdownInterval);
        dailyCountdownInterval = null;
    };

    window.addEventListener("beforeunload", stopDailyCountdown);

    const setSkeletonLoading = (isLoading) => {
        if (completedSkeleton) completedSkeleton.classList.toggle("hidden", !isLoading);
        if (trendSkeleton) trendSkeleton.classList.toggle("hidden", !isLoading);
        if (isLoading) {
            if (donutWrap) donutWrap.classList.add("hidden");
            if (trendWrap) trendWrap.classList.add("hidden");
        }
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
        const points = (Array.isArray(trendPoints) ? trendPoints : [])
            .filter((point) => !point?.freeDay || Number(point?.completed || 0) > 0 || Number(point?.missed || 0) > 0);
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

    const prepareCanvas = (canvas) => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(rect.width || canvas.parentElement?.clientWidth || 320));
        const height = Math.max(1, Math.floor(rect.height || canvas.parentElement?.clientHeight || 240));
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, width, height };
    };

    const drawFallbackDonut = (canvas, completed, missed, completionRate) => {
        const { ctx, width, height } = prepareCanvas(canvas);
        const total = completed + missed;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.34;
        const lineWidth = Math.max(18, radius * 0.22);
        const startAngle = -Math.PI / 2;
        const completedAngle = total > 0 ? (completed / total) * Math.PI * 2 : 0;

        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + Math.PI * 2);
        ctx.stroke();

        if (completed > 0) {
            ctx.strokeStyle = "#10b981";
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + completedAngle);
            ctx.stroke();
        }

        ctx.fillStyle = chartTheme.text;
        ctx.font = "700 24px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(completionRate || 0)}%`, centerX, centerY - 4);
        ctx.fillStyle = chartTheme.muted;
        ctx.font = "500 13px Inter, sans-serif";
        ctx.fillText("Completion", centerX, centerY + 18);
    };

    const drawFallbackTrend = (canvas, labels, completedData, missedData) => {
        const { ctx, width, height } = prepareCanvas(canvas);
        const padding = { top: 22, right: 18, bottom: 42, left: 38 };
        const plotWidth = Math.max(1, width - padding.left - padding.right);
        const plotHeight = Math.max(1, height - padding.top - padding.bottom);
        const maxValue = Math.max(1, ...completedData, ...missedData);
        const xFor = (index) => padding.left + (labels.length <= 1 ? plotWidth : (index / (labels.length - 1)) * plotWidth);
        const yFor = (value) => padding.top + plotHeight - (value / maxValue) * plotHeight;

        const drawSeries = (data, color) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            data.forEach((value, index) => {
                const x = xFor(index);
                const y = yFor(value);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            data.forEach((value, index) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(xFor(index), yFor(value), 3.5, 0, Math.PI * 2);
                ctx.fill();
            });
        };

        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = chartTheme.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i += 1) {
            const y = padding.top + (i / 4) * plotHeight;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }

        drawSeries(completedData, "#10b981");
        drawSeries(missedData, "#ef4444");

        ctx.fillStyle = chartTheme.muted;
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";
        const labelStep = Math.max(1, Math.ceil(labels.length / 6));
        labels.forEach((label, index) => {
            if (index % labelStep !== 0 && index !== labels.length - 1) return;
            ctx.fillText(label, xFor(index), height - 16);
        });
    };

    const renderProgressCharts = (charts, period, completionRate) => {
        if (!completionPieCanvas || !trendCanvas) return;
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

        if (hasDonutData && window.Chart) {
            completionPieChart = new Chart(completionPieCanvas, {
                type: "doughnut",
                data: {
                    labels: charts.completedVsMissed.labels,
                    datasets: [{
                        data: charts.completedVsMissed.values,
                        backgroundColor: ["#10b981", "#ef4444"],
                        borderColor: chartTheme.border,
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
                            backgroundColor: chartTheme.panel,
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
        } else if (hasDonutData) {
            drawFallbackDonut(completionPieCanvas, completed, missed, completionRate);
        }
        if (donutWrap && hasDonutData) {
            donutWrap.classList.remove("chart-reveal");
            requestAnimationFrame(() => donutWrap.classList.add("chart-reveal"));
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

        if (!window.Chart) {
            drawFallbackTrend(trendCanvas, labels, completedData, missedData);
            if (trendWrap) {
                trendWrap.classList.remove("chart-reveal");
                requestAnimationFrame(() => trendWrap.classList.add("chart-reveal"));
            }
            setProgressStatus("Charts are shown in fallback mode because Chart.js did not load.", false, true);
            return;
        }

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
                        borderWidth: 3,
                        tension: 0.38,
                        stepped: false,
                        spanGaps: true,
                        pointRadius: 3,
                        pointBackgroundColor: "#10b981",
                        pointBorderColor: chartTheme.border,
                        pointBorderWidth: 1.5,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: "#10b981",
                        pointHoverBorderColor: chartTheme.text,
                        pointHoverBorderWidth: 2
                    },
                    {
                        label: "Missed",
                        data: missedData,
                        borderColor: "#ef4444",
                        backgroundColor: missedGradient,
                        fill: true,
                        borderWidth: 2,
                        tension: 0.38,
                        stepped: false,
                        spanGaps: true,
                        pointRadius: 3,
                        pointBackgroundColor: "#ef4444",
                        pointBorderColor: chartTheme.border,
                        pointBorderWidth: 1.5,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: "#ef4444",
                        pointHoverBorderColor: chartTheme.text,
                        pointHoverBorderWidth: 2
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
                            color: chartTheme.muted,
                            boxWidth: 10,
                            usePointStyle: true,
                            pointStyle: "circle",
                            padding: 16
                        }
                    },
                    tooltip: {
                            backgroundColor: chartTheme.panel,
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
                            color: chartTheme.muted,
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
                            color: chartTheme.grid
                        },
                        ticks: {
                            color: chartTheme.muted,
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
        if (trendWrap) {
            trendWrap.classList.remove("chart-reveal");
            requestAnimationFrame(() => trendWrap.classList.add("chart-reveal"));
        }
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
            if (window.Chart) {
                setProgressStatus("", false, false);
            }
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

    let socialToastTimer = null;
    const showSocialToast = (message = "", isError = false) => {
        const socialToast = document.getElementById("socialToast");
        if (!socialToast || !message) return;
        clearTimeout(socialToastTimer);
        socialToast.textContent = message;
        socialToast.classList.remove("hidden");
        socialToast.classList.toggle("error", isError);
        socialToastTimer = setTimeout(() => {
            socialToast.classList.add("hidden");
        }, 4500);
    };

    const loadSocialView = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const socialStatus = document.getElementById("socialStatus");
        const setSocialStatus = (message = "", isError = false, show = true) => {
            if (!socialStatus) return;
            socialStatus.textContent = message;
            socialStatus.classList.toggle("hidden", !show || !message);
            socialStatus.classList.toggle("error", isError);
            if (message && show && !message.toLowerCase().startsWith("loading")) {
                showSocialToast(message, isError);
            }
        };
        const emptySocialState = (message) => `<div class="social-empty-state"><p>${escapeHtml(message)}</p></div>`;
        const getDuoHistorySummary = (history = []) => {
            const historyMap = new Map((Array.isArray(history) ? history : []).map((entry) => [entry.date, entry]));
            const dates = Array.from({ length: 7 }, (_, index) => shiftDateKey(getTodayDate(), -index));
            const recentRecords = dates.map((date) => historyMap.get(date)).filter(Boolean);
            const completed = recentRecords.filter((entry) => entry.status === "completed").length;
            const missed = recentRecords.filter((entry) => entry.status === "missed").length;
            const pending = recentRecords.filter((entry) => entry.status === "pending").length;
            const todayStatus = historyMap.get(getTodayDate())?.status || "pending";

            return {
                completed,
                missed,
                pending,
                needsAction: pending + missed,
                todayStatus
            };
        };
        const renderDuoPersonDetail = (item, person = "me") => {
            const isFriend = person === "friend";
            const summary = getDuoHistorySummary(isFriend ? item.friendHistory : item.myHistory);
            const completion = Math.max(0, Math.min(100, Number(isFriend ? item.friendWeeklyCompletion : item.myWeeklyCompletion) || 0));
            const streak = Number(isFriend ? item.friendStreak : item.myStreak) || 0;
            const ownerLabel = isFriend ? (item.friendName || "Partner") : "You";
            const statusClass = summary.todayStatus || "pending";

            return `
                <div class="duo-task-detail">
                    <div class="duo-task-detail-head">
                        <div>
                            <span class="duo-task-owner">${escapeHtml(ownerLabel)}'s task</span>
                            <h4>${escapeHtml(item.title || "Shared habit")}</h4>
                            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
                        </div>
                        <span class="status-badge status-${statusClass}">${escapeHtml(statusClass)}</span>
                    </div>
                    <div class="duo-task-metrics">
                        <div><span>Done</span><strong>${summary.completed}</strong></div>
                        <div><span>Need to do</span><strong>${summary.needsAction}</strong></div>
                        <div><span>Pending</span><strong>${summary.pending}</strong></div>
                        <div><span>Missed</span><strong>${summary.missed}</strong></div>
                    </div>
                    <div class="duo-task-progress-row">
                        <span>${completion}% weekly completion</span>
                        <span>${streak}d streak</span>
                    </div>
                    <div class="duo-progress-bar">
                        <div class="duo-progress-fill ${isFriend ? "friend-fill" : ""}" style="width: ${completion}%;"></div>
                    </div>
                </div>
            `;
        };
        setSocialStatus("Loading Duos and Global Pulse...", false, true);

        try {
            if (allHabits.length === 0 && typeof refreshHabits === "function") {
                await refreshHabits();
            }

            const res = await fetch("/api/social/shared-habits", {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "x-user-timezone": getSettingsTimezone()
                }
            });
            const sharedData = await res.json();
            if (!res.ok) throw new Error(sharedData.error || "Failed to load shared habits");

            const socialHabitSelect = document.getElementById("socialHabitSelect");
            if (socialHabitSelect) {
                socialHabitSelect.innerHTML = '<option value="">-- Choose Habit --</option>';
                allHabits.forEach((habit) => {
                    if (!habit.isShared || habit.shareStatus === "none") {
                        const opt = document.createElement("option");
                        opt.value = habit._id;
                        opt.textContent = habit.title;
                        socialHabitSelect.appendChild(opt);
                    }
                });
                syncSocialHabitDropdown();
                updateSocialInviteFormState();
            }

            const activeDuosList = document.getElementById("activeDuosList");
            const pendingInvitesList = document.getElementById("pendingInvitesList");

            if (activeDuosList) activeDuosList.innerHTML = "";
            if (pendingInvitesList) pendingInvitesList.innerHTML = "";

            const activeShared = sharedData.filter(item => item.shareStatus === "accepted");
            const pendingShared = sharedData.filter(item => item.shareStatus === "pending");

            if (activeShared.length === 0) {
                if (activeDuosList) {
                    activeDuosList.innerHTML = emptySocialState("No active duo habits. Invite a partner to build habits together.");
                }
            } else {
                activeShared.forEach(item => {
                    const card = document.createElement("div");
                    const myWeeklyCompletion = Math.max(0, Math.min(100, Number(item.myWeeklyCompletion) || 0));
                    const friendWeeklyCompletion = Math.max(0, Math.min(100, Number(item.friendWeeklyCompletion) || 0));
                    card.className = "pending-invite-card duo-shared-card";
                    card.dataset.duoId = item._id;
                    card.innerHTML = `
                        <div class="duo-card-header">
                            <div>
                                <h3 class="duo-card-title">${escapeHtml(item.title)}</h3>
                                <span class="duo-card-meta">Partner: <strong>${escapeHtml(item.friendName)}</strong></span>
                            </div>
                            <span class="difficulty-tag duo-difficulty ${item.difficulty || "medium"}">${item.difficulty || "medium"}</span>
                        </div>
                        <div class="duo-stat-grid" role="tablist" aria-label="Duo task owner">
                            <button type="button" class="duo-user-col active" data-duo-person="me" data-duo-id="${item._id}">
                                <span class="duo-user-label">YOU</span>
                                <strong class="duo-streak mine">${item.myStreak}d</strong>
                                <div class="duo-progress-bar">
                                    <div class="duo-progress-fill" style="width: ${myWeeklyCompletion}%;"></div>
                                </div>
                                <span class="duo-completion-label">${myWeeklyCompletion}% completion</span>
                            </button>
                            <button type="button" class="duo-user-col friend" data-duo-person="friend" data-duo-id="${item._id}">
                                <span class="duo-user-label friend-label">${escapeHtml(item.friendName)}</span>
                                <strong class="duo-streak friend-streak">${item.friendStreak}d</strong>
                                <div class="duo-progress-bar">
                                    <div class="duo-progress-fill friend-fill" style="width: ${friendWeeklyCompletion}%;"></div>
                                </div>
                                <span class="duo-completion-label">${friendWeeklyCompletion}% completion</span>
                            </button>
                        </div>
                        <div class="duo-task-detail-wrap" data-duo-detail="${item._id}">
                            ${renderDuoPersonDetail(item, "me")}
                        </div>
                    `;
                    activeDuosList.appendChild(card);
                });
                activeDuosList.querySelectorAll("[data-duo-person]").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const selectedItem = activeShared.find((item) => item._id === btn.dataset.duoId);
                        if (!selectedItem) return;
                        const card = btn.closest(".duo-shared-card");
                        const detailWrap = card?.querySelector(`[data-duo-detail="${btn.dataset.duoId}"]`);
                        card?.querySelectorAll("[data-duo-person]").forEach((itemBtn) => {
                            itemBtn.classList.toggle("active", itemBtn === btn);
                        });
                        if (detailWrap) {
                            detailWrap.innerHTML = renderDuoPersonDetail(selectedItem, btn.dataset.duoPerson);
                        }
                    });
                });
            }

            if (pendingShared.length === 0) {
                if (pendingInvitesList) {
                    pendingInvitesList.innerHTML = emptySocialState("No pending invitations.");
                }
            } else {
                pendingShared.forEach(item => {
                    const card = document.createElement("div");
                    card.className = "pending-invite-card";
                    if (item.isIncoming) {
                        card.innerHTML = `
                            <div>
                                <span class="invite-chip incoming">Incoming</span>
                                <h3 class="invite-title">${escapeHtml(item.title)}</h3>
                                <p class="invite-meta">From: <strong>${escapeHtml(item.friendName)}</strong> (${escapeHtml(item.friendEmail)})</p>
                            </div>
                            <div class="invite-actions">
                                <button class="planning-danger-btn invite-btn invite-btn-danger deny-invite-btn" data-id="${item._id}">Deny</button>
                                <button class="send-btn invite-btn accept-invite-btn" data-id="${item._id}">Accept</button>
                            </div>
                        `;
                    } else {
                        card.innerHTML = `
                            <div>
                                <span class="invite-chip sent">Sent Pending</span>
                                <h3 class="invite-title">${escapeHtml(item.title)}</h3>
                                <p class="invite-meta">To: <strong>${escapeHtml(item.friendEmail)}</strong></p>
                            </div>
                            <div class="invite-actions">
                                <button class="planning-danger-btn invite-btn invite-btn-danger deny-invite-btn" data-id="${item._id}">Cancel</button>
                            </div>
                        `;
                    }
                    pendingInvitesList.appendChild(card);
                });

                pendingInvitesList.querySelectorAll(".accept-invite-btn").forEach(btn => {
                    btn.addEventListener("click", async () => {
                        btn.disabled = true;
                        try {
                            const inviteId = btn.dataset.id;
                            const resAccept = await fetch("/api/social/accept", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${token}`
                                },
                                body: JSON.stringify({ habitId: inviteId })
                            });
                            const dataAccept = await resAccept.json();
                            if (!resAccept.ok) throw new Error(dataAccept.error || "Failed to accept invite");
                            showSocialToast("Invitation accepted. The shared habit is now in Active Partners.");
                            await fetchHabits();
                            await loadSocialView();
                        } catch (err) {
                            showSocialToast(err.message, true);
                            btn.disabled = false;
                        }
                    });
                });

                pendingInvitesList.querySelectorAll(".deny-invite-btn").forEach(btn => {
                    btn.addEventListener("click", async () => {
                        btn.disabled = true;
                        const isCancel = btn.textContent.trim().toLowerCase() === "cancel";
                        const confirmMessage = isCancel
                            ? "Cancel this invitation?"
                            : "Deny this invitation?";
                        if (!confirm(confirmMessage)) {
                            btn.disabled = false;
                            return;
                        }
                        try {
                            const inviteId = btn.dataset.id;
                            const resDecline = await fetch("/api/social/decline", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${token}`
                                },
                                body: JSON.stringify({ habitId: inviteId })
                            });
                            const dataDecline = await resDecline.json();
                            if (!resDecline.ok) throw new Error(dataDecline.error || "Failed to cancel invite");
                            setSocialStatus(isCancel ? "Invitation canceled." : "Invitation denied and removed.", false, true);
                            await fetchHabits();
                            await loadSocialView();
                        } catch (err) {
                            showSocialToast(err.message, true);
                            btn.disabled = false;
                        }
                    });
                });
            }

            const resPulse = await fetch("/api/social/global-pulse", {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "x-user-timezone": getSettingsTimezone()
                }
            });
            const pulseData = await resPulse.json();
            if (!resPulse.ok) throw new Error(pulseData.error || "Failed to load Global Pulse");

            const globalPulseRate = document.getElementById("globalPulseRate");
            const globalPulseFitness = document.getElementById("globalPulseFitness");
            const globalPulseFreezes = document.getElementById("globalPulseFreezes");
            const globalPulseTrend = document.getElementById("globalPulseTrend");
            const globalPulseCompleted = document.getElementById("globalPulseCompleted");

            if (globalPulseRate) globalPulseRate.textContent = `${pulseData.completionRateToday}%`;
            if (globalPulseFitness) globalPulseFitness.textContent = `${pulseData.fitnessCompletionRateToday}%`;
            if (globalPulseFreezes) globalPulseFreezes.textContent = `${pulseData.streakFreezesUsedToday} saved`;
            if (globalPulseTrend) globalPulseTrend.textContent = `Yesterday: ${pulseData.completionRateYesterday}%`;
            if (globalPulseCompleted) globalPulseCompleted.textContent = `Completed: ${pulseData.totalCompletedToday}`;
            setSocialStatus("", false, false);

        } catch (error) {
            setSocialStatus(`Warning: ${error.message}`, true, true);
        }
    };

    const socialInviteForm = document.getElementById("socialInviteForm");
    const socialHabitSelect = document.getElementById("socialHabitSelect");
    const socialHabitDropdownBtn = document.getElementById("socialHabitDropdownBtn");
    const socialHabitDropdownText = document.getElementById("socialHabitDropdownText");
    const socialHabitDropdownList = document.getElementById("socialHabitDropdownList");
    const socialFriendEmail = document.getElementById("socialFriendEmail");
    const socialEmailError = document.getElementById("socialEmailError");
    const socialInviteSubmitBtn = document.getElementById("socialInviteSubmitBtn");
    let socialInviteIsSending = false;
    const isValidInviteEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
    const closeSocialHabitDropdown = () => {
        const wrap = socialHabitDropdownBtn?.closest(".social-select");
        wrap?.classList.remove("open");
        socialHabitDropdownBtn?.setAttribute("aria-expanded", "false");
        socialHabitDropdownList?.classList.add("hidden");
    };
    const updateSocialInviteFormState = () => {
        const hasHabit = Boolean(socialHabitSelect?.value);
        const email = socialFriendEmail?.value.trim() || "";
        const hasEmail = Boolean(email);
        const validEmail = isValidInviteEmail(email);
        if (socialEmailError) socialEmailError.classList.toggle("hidden", !hasEmail || validEmail);
        socialFriendEmail?.classList.toggle("invalid", hasEmail && !validEmail);
        if (socialInviteSubmitBtn) socialInviteSubmitBtn.disabled = socialInviteIsSending || !(hasHabit && validEmail);
    };
    const setSocialHabitValue = (habitId) => {
        if (!socialHabitSelect) return;
        socialHabitSelect.value = habitId || "";
        const selectedText = socialHabitSelect.selectedOptions?.[0]?.textContent || "Choose habit";
        if (socialHabitDropdownText) socialHabitDropdownText.textContent = habitId ? selectedText : "Choose habit";
        socialHabitDropdownList?.querySelectorAll(".social-select-option").forEach((option) => {
            option.classList.toggle("active", option.dataset.value === habitId);
        });
        closeSocialHabitDropdown();
        updateSocialInviteFormState();
    };
    const syncSocialHabitDropdown = () => {
        if (!socialHabitSelect || !socialHabitDropdownList) return;
        const options = [...socialHabitSelect.options].filter((option) => option.value);
        if (options.length === 0) {
            socialHabitDropdownList.innerHTML = '<p class="social-select-empty">No habits available to invite.</p>';
        } else {
            socialHabitDropdownList.innerHTML = options.map((option) => `
                <button type="button" class="social-select-option ${option.value === socialHabitSelect.value ? "active" : ""}" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${option.value === socialHabitSelect.value}">
                    ${escapeHtml(option.textContent || "Untitled habit")}
                </button>
            `).join("");
        }
        setSocialHabitValue(socialHabitSelect.value || "");
    };

    if (socialHabitDropdownBtn) {
        socialHabitDropdownBtn.addEventListener("click", () => {
            const wrap = socialHabitDropdownBtn.closest(".social-select");
            const shouldOpen = socialHabitDropdownList?.classList.contains("hidden");
            wrap?.classList.toggle("open", Boolean(shouldOpen));
            socialHabitDropdownBtn.setAttribute("aria-expanded", String(Boolean(shouldOpen)));
            socialHabitDropdownList?.classList.toggle("hidden", !shouldOpen);
        });
    }
    socialHabitDropdownList?.addEventListener("click", (event) => {
        const option = event.target.closest(".social-select-option");
        if (!option) return;
        setSocialHabitValue(option.dataset.value || "");
    });
    socialFriendEmail?.addEventListener("input", updateSocialInviteFormState);
    document.addEventListener("click", (event) => {
        if (!event.target.closest("[data-social-select]")) closeSocialHabitDropdown();
    });

    if (socialInviteForm) {
        syncSocialHabitDropdown();
        updateSocialInviteFormState();
        socialInviteForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (socialInviteIsSending) return;
            const habitId = socialHabitSelect?.value || "";
            const friendEmail = socialFriendEmail?.value.trim() || "";
            const token = localStorage.getItem("token");
            const inviteStatus = document.getElementById("socialInviteStatus");
            if (!isValidInviteEmail(friendEmail)) {
                if (socialEmailError) socialEmailError.classList.remove("hidden");
                if (inviteStatus) {
                    inviteStatus.textContent = "Please enter a valid email address.";
                    inviteStatus.classList.remove("hidden");
                }
                updateSocialInviteFormState();
                socialFriendEmail?.focus();
                return;
            }
            if (!habitId || !token) return;

            const submitBtn = socialInviteSubmitBtn || socialInviteForm.querySelector("button[type='submit']");
            socialInviteIsSending = true;
            submitBtn.disabled = true;
            submitBtn.textContent = "Sending...";
            if (inviteStatus) {
                inviteStatus.textContent = "";
                inviteStatus.classList.add("hidden");
            }

            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 12000);

            try {
                const res = await fetch("/api/social/invite", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ habitId, friendEmail }),
                    signal: controller.signal
                });
                window.clearTimeout(timeoutId);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Invitation could not be sent. Please check the email and try again.");
                }
                if (inviteStatus) {
                    inviteStatus.textContent = "Invitation sent";
                    inviteStatus.classList.remove("hidden");
                }
                showSocialToast("Invitation sent. Waiting for acceptance.");
                if (socialFriendEmail) socialFriendEmail.value = "";
                setSocialHabitValue("");
                void (async () => {
                    try {
                        await fetchHabits();
                        await loadSocialView();
                    } catch (refreshError) {
                        console.error("Duo invite refresh failed.", { reason: refreshError.message });
                    }
                })();
            } catch (err) {
                window.clearTimeout(timeoutId);
                const message = err.name === "AbortError"
                    ? "Invitation could not be sent. Please check the email and try again."
                    : (err.message || "Invitation could not be sent. Please check the email and try again.");
                console.error("Duo invite request failed.", { reason: err.name || "request-error" });
                if (inviteStatus) {
                    inviteStatus.textContent = message;
                    inviteStatus.classList.remove("hidden");
                }
                showSocialToast(message, true);
            } finally {
                socialInviteIsSending = false;
                submitBtn.textContent = "Send Invitation";
                updateSocialInviteFormState();
            }
        });
    }

    setActiveView(localStorage.getItem("startPage") || "dashboard");
});




