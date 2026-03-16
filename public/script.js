const form = document.getElementById("aiForm");
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
    
    // UI Reset
    responseContainer.classList.add("hidden");
    errorText.innerHTML = "";
    promptInput.value = "";

    try {
        const res = await fetch("/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: userPrompt })
        });

        const data = await res.json();

        if (!res.ok) {
            // Specifically check for that 429 error
            if (res.status === 429 || data.details?.includes("429")) {
                throw new Error("Google is limiting requests. Please wait 1 minute.");
            }
            throw new Error(data.details || "API Connection Failed");
        }

        // Add line breaks for readability
        responseText.innerHTML = data.response.replace(/\n/g, '<br>');
        responseContainer.classList.remove("hidden");

    } catch (err) {
        errorText.innerHTML = `⚠️ ${err.message}`;
    } finally {
        loading.style.display = "none";
        button.disabled = false;
        
        // Scroll to the new answer
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
});