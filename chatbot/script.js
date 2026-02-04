document.addEventListener("DOMContentLoaded", () => {
  // Try to find elements by common IDs
  const userInput = document.getElementById("userInput");
  const chatBox = document.getElementById("chatBox");
  const sendBtn = document.getElementById("sendBtn");

  // If any are missing, show a clear error in console
  if (!userInput || !chatBox || !sendBtn) {
    console.error("Missing elements. Check IDs in index.html:", {
      userInputFound: !!userInput,
      chatBoxFound: !!chatBox,
      sendBtnFound: !!sendBtn,
    });
    return;
  }

  // Prevent form submit refresh if button is inside a form
  const form = sendBtn.closest("form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    sendMessage();
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    userInput.value = "";

    const typing = addMessage("…", "bot");

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text }),
      });

      // If server returns error, show it
      if (!res.ok) {
        typing.textContent = `⚠️ Server error: ${res.status}`;
        return;
      }

      const data = await res.json();
      typing.textContent = data.answer || "No answer returned.";
    } catch (err) {
      console.error(err);
      typing.textContent = "⚠️ Could not reach backend. Is Flask running?";
    }

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.className = `message ${sender}`;
    msg.textContent = text;
    chatBox.appendChild(msg);
    return msg;
  }
});
