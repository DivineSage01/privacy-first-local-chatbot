/* ===============================
   ELEMENTS
   =============================== */
const userInput  = document.getElementById("userInput");
const chatBox    = document.getElementById("chatBox");
const sendBtn    = document.getElementById("sendBtn");
const adminPanel = document.getElementById("adminPanel");

const kbId       = document.getElementById("kbId");
const kbCategory = document.getElementById("kbCategory");
const kbTitle    = document.getElementById("kbTitle");
const kbContent  = document.getElementById("kbContent");
const kbSaveBtn  = document.getElementById("kbSaveBtn");
const kbList     = document.getElementById("kbList");

if (sendBtn)   sendBtn.addEventListener("click", sendMessage);
if (userInput) userInput.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

/* ===============================
   SMALL TALK
   =============================== */
const SMALL_TALK = [
  { pattern: /^(hi|hey|hello|hiya|good morning|good afternoon|good evening|yo|sup|howdy)[!.,]?$/i,
    replies: [
      "Hello! Great to hear from you. How can I help you today? You can ask me about training schedules, fixtures, squad info, club policies, or anything else Lumen FC related.",
      "Hey there! I'm FootBot, your Lumen FC assistant. What can I help you with today?",
      "Hi! Welcome to Lumen FC's assistant. Ask me anything about the club — training, matches, players, or policies.",
    ]},
  { pattern: /^(thanks|thank you|cheers|thx|ty|thank u)[!.,]?$/i,
    replies: [
      "You're welcome! Is there anything else I can help you with?",
      "Happy to help! Feel free to ask if you have any other questions.",
      "No problem at all! Anything else you'd like to know about Lumen FC?",
    ]},
  { pattern: /^(bye|goodbye|see you|see ya|cya|later|that'?s? all)[!.,]?$/i,
    replies: [
      "Goodbye! Come back any time you need help. Up the Lumen!",
      "See you later! Good luck on the pitch. ⚽",
      "Take care! Don't forget training this week. 👋",
    ]},
  { pattern: /^(who are you|what are you|what is footbot|tell me about yourself|introduce yourself)[?!.]?$/i,
    replies: ["I'm FootBot, the official virtual assistant for Lumen FC. I'm here to help players, coaches, and members get quick answers about the club — training schedules, fixtures, squad info, policies, and more. Just ask!"]},
  { pattern: /^(what can you do|what do you know|how can you help|what can you help with|what do you do)[?!.]?$/i,
    replies: ["Here's what I can help with:\n\n⚽ Training schedules and session structure\n📅 Fixtures, results, and match day info\n👥 Squad info and player profiles\n📋 Club policies and code of conduct\n🏋️ Fitness, nutrition, and injury advice\n🔍 Coaching drills and tactics\n📊 Progress and attendance records\n\nJust ask me anything naturally — or type help for a list of commands."]},
  { pattern: /^(how are you|you alright|you ok|how do you do)[?!.]?$/i,
    replies: ["All good here! Ready to answer your Lumen FC questions. What's on your mind?"]},
  { pattern: /^(good|great|awesome|brilliant|nice|perfect|sounds good|ok|okay|cool|got it)[!.,]?$/i,
    replies: ["Glad to hear it! Anything else I can help you with?", "Great! Feel free to ask if you need anything else."]},
];

/* ===============================
   CHAT
   =============================== */
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  addMessage(text, "user");
  userInput.value = "";

  for (const st of SMALL_TALK) {
    if (st.pattern.test(text)) {
      const reply = st.replies[Math.floor(Math.random() * st.replies.length)];
      const el = appendTyping();
      await simulateTyping(el, reply);
      return;
    }
  }

  if (/^(overview|summary)$/i.test(text))   { await handleOverview();  return; }
  if (/^help$/i.test(text))                  { handleHelp();             return; }
  if (/^progress$/i.test(text))              { await handleProgressCommand(); return; }
  if (/^fixtures$/i.test(text))              { await handleFixturesCommand(); return; }
  if (/^squad$/i.test(text))                 { await handleSquadCommand();    return; }

  const compareMatch = text.match(/^compare\s+(.+?)\s+(?:with|vs\.?|and)\s+(.+)$/i);
  if (compareMatch) { await handleCompare(compareMatch[1].trim(), compareMatch[2].trim()); return; }

  const typing = appendTyping();
  try {
    const res  = await fetch("/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text }),
    });
    const data = await res.json();
    if (data.answer && data.answer.startsWith("I can't find")) {
      typing.innerHTML = noMatchResponse(text);
    } else {
      typing.textContent = data.answer || "I'm not sure about that one. Try rephrasing or type help.";
      if (data.src_info) {
        const meta = document.createElement("small");
        meta.style.cssText = "display:block;margin-top:6px;opacity:.45;font-size:.72em";
        meta.textContent   = data.src_info;
        typing.appendChild(meta);
      }
    }
  } catch {
    typing.textContent = "⚠️ I'm having trouble connecting right now. Please check the server is running.";
  }
}

function noMatchResponse(query) {
  return `I don't have specific information about "<em>${query}</em>" right now.<br><br>
Things I <strong>can</strong> help with:<br>
&nbsp;• Training times and session structure<br>
&nbsp;• Fixtures, results and match day info<br>
&nbsp;• Squad profiles and player stats<br>
&nbsp;• Club policies and code of conduct<br>
&nbsp;• Fitness, nutrition and injury advice<br><br>
Try rephrasing, or type <strong>help</strong> to see all commands.`;
}

async function simulateTyping(el, text) {
  await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
  el.innerHTML = text.replace(/\n/g, "<br>");
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ===============================
   COMMANDS
   =============================== */
async function handleOverview() {
  const typing = appendTyping();
  try {
    const res  = await fetch("/api/overview");
    const data = await res.json();
    const cats = Object.entries(data.categories || {})
      .map(([k, v]) => `&nbsp;&nbsp;• ${k}: <strong>${v}</strong> ${v === 1 ? "entry" : "entries"}`).join("<br>");
    typing.innerHTML =
      `<strong>📊 Lumen FC Knowledge Base</strong><br><br>` +
      `I have <strong>${data.total_entries}</strong> entries across:<br><br>` +
      (cats || "&nbsp;&nbsp;No entries yet.") +
      `<br><br>Just ask me anything about these topics!`;
  } catch { typing.textContent = "⚠️ Could not fetch overview."; }
}

async function handleCompare(termA, termB) {
  const typing = appendTyping();
  try {
    const [rA, rB] = await Promise.all([
      fetch("/ask", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({q: termA}) }).then(r => r.json()),
      fetch("/ask", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({q: termB}) }).then(r => r.json()),
    ]);
    typing.innerHTML =
      `<strong>🔍 Comparing "${termA}" vs "${termB}"</strong><br><br>` +
      `<strong>${termA}:</strong><br>${rA.answer}<br><br>` +
      `<strong>${termB}:</strong><br>${rB.answer}`;
  } catch { typing.textContent = "⚠️ Compare failed."; }
}

function handleHelp() {
  const typing = appendTyping();
  typing.innerHTML =
    `<strong>⚡ FootBot — What I Can Do</strong><br><br>` +
    `<strong>Natural questions:</strong><br>` +
    `&nbsp;• "When is training?" &nbsp;• "Who is the captain?"<br>` +
    `&nbsp;• "What are the membership fees?" &nbsp;• "How do I join?"<br><br>` +
    `<strong>Quick commands:</strong><br>` +
    `&nbsp;• <strong>overview</strong> — knowledge base summary<br>` +
    `&nbsp;• <strong>fixtures</strong> — upcoming matches<br>` +
    `&nbsp;• <strong>squad</strong> — current squad numbers<br>` +
    `&nbsp;• <strong>progress</strong> — recent progress records<br>` +
    `&nbsp;• <strong>compare X with Y</strong> — compare two topics<br>` +
    `&nbsp;• <strong>help</strong> — show this message<br><br>` +
    `Can't find what you need? Contact: <strong>contact@lumenfc.club</strong>`;
}

async function handleProgressCommand() {
  const typing = appendTyping();
  try {
    const res     = await fetch("/api/progress", { credentials: "same-origin" });
    const records = await res.json();
    if (!Array.isArray(records) || records.length === 0) {
      typing.textContent = "No progress records logged yet."; return;
    }
    const recent = [...records].reverse().slice(0, 5);
    typing.innerHTML =
      `<strong>📈 Recent Progress Records</strong><br><br>` +
      recent.map(r => `&nbsp;• <strong>${r.member}</strong> — ${r.date} (${r.category})${r.value ? ": " + r.value : ""}`).join("<br>") +
      `<br><br><small style="opacity:.5">Showing ${recent.length} most recent.</small>`;
  } catch { typing.textContent = "⚠️ Could not fetch progress records."; }
}

async function handleFixturesCommand() {
  const typing = appendTyping();
  try {
    const res  = await fetch("/ask", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({q:"upcoming fixtures schedule"}) });
    const data = await res.json();
    typing.innerHTML = `<strong>📅 Fixtures</strong><br><br>${data.answer}`;
  } catch { typing.textContent = "⚠️ Could not fetch fixture info."; }
}

async function handleSquadCommand() {
  const typing = appendTyping();
  try {
    const res  = await fetch("/ask", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({q:"squad numbers players positions"}) });
    const data = await res.json();
    typing.innerHTML = `<strong>👥 Current Squad</strong><br><br>${data.answer}`;
  } catch { typing.textContent = "⚠️ Could not fetch squad info."; }
}

/* ===============================
   DOM HELPERS
   =============================== */
function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.className   = `message ${sender}`;
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendTyping() {
  const el = document.createElement("div");
  el.className   = "message bot";
  el.textContent = "…";
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
  return el;
}

/* ===============================
   WELCOME MESSAGE
   =============================== */
function sendWelcomeMessage(userRole) {
  chatBox.innerHTML = "";
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const botIntro = document.createElement("div");
  botIntro.className = "message bot";
  botIntro.innerHTML =
    `${timeGreeting}! 👋 I'm <strong>FootBot</strong>, the official virtual assistant for <strong>Lumen FC</strong>.<br><br>` +
    `I'm here to help you with anything club-related:<br><br>` +
    `⚽ &nbsp;Training schedules &amp; session info<br>` +
    `📅 &nbsp;Fixtures, results &amp; match day arrangements<br>` +
    `👥 &nbsp;Squad profiles &amp; player stats<br>` +
    `📋 &nbsp;Club policies, rules &amp; FAQs<br>` +
    `🏋️ &nbsp;Fitness, nutrition &amp; injury advice<br>` +
    `🎯 &nbsp;Coaching drills &amp; tactics<br><br>` +
    `Just ask me anything naturally, for example:<br>` +
    `<em>"When is training this week?"</em> or <em>"Who is the top scorer?"</em><br><br>` +
    `Type <strong>help</strong> to see all available commands.`;
  chatBox.appendChild(botIntro);
  if (userRole === "admin") {
    setTimeout(() => {
      const adminMsg = document.createElement("div");
      adminMsg.className = "message bot";
      adminMsg.innerHTML =
        `🔐 <strong>Admin access granted.</strong> The management panels above give you full access to the knowledge base, player database, memberships, performance tracking, and contract generation.`;
      chatBox.appendChild(adminMsg);
      chatBox.scrollTop = chatBox.scrollHeight;
    }, 800);
  }
}

/* ===============================
   KNOWLEDGE BASE CRUD
   =============================== */
async function loadEntries() {
  if (!kbList) return;
  kbList.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const res     = await fetch("/api/entries", { credentials: "same-origin" });
    const entries = await res.json();
    kbList.innerHTML = "";
    if (!Array.isArray(entries) || entries.length === 0) {
      kbList.innerHTML = "<div class='trained-empty'>No entries yet.</div>"; return;
    }
    entries.forEach(e => kbList.appendChild(buildEntryRow(e)));
  } catch { kbList.innerHTML = "<div class='trained-empty'>⚠️ Could not load entries.</div>"; }
}

function buildEntryRow(e) {
  const item = document.createElement("div");
  item.className = "trained-item";
  const text = document.createElement("div");
  text.className = "trained-item__text";
  const head = document.createElement("strong");
  head.textContent = `${e.id} (${e.category})`;
  const title = document.createElement("span");
  if (e.title) title.textContent = `Title: ${e.title}`;
  const content = document.createElement("span");
  content.textContent = e.content || "";
  text.appendChild(head);
  if (e.title) text.appendChild(title);
  text.appendChild(content);
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:6px;flex-shrink:0";
  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.style.cssText = "background:rgba(79,156,255,0.15);color:#7ec8ff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem";
  editBtn.onclick = () => openEditModal(e);
  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.onclick = async () => {
    if (!confirm(`Delete entry ${e.id}?`)) return;
    await fetch(`/api/entries/${encodeURIComponent(e.id)}`, { method: "DELETE", credentials: "same-origin" });
    await loadEntries();
  };
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  item.appendChild(text);
  item.appendChild(actions);
  return item;
}

function openEditModal(entry) {
  document.getElementById("editModal")?.remove();
  const cats = ["Training","Coaching","Fixtures","Players","Policies","FAQ","Progress","Fitness","Club Info"];
  const modal = document.createElement("div");
  modal.id = "editModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(4px)";
  modal.innerHTML = `
    <div style="width:min(94%,480px);background:rgba(14,24,18,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:22px;padding:28px;display:flex;flex-direction:column;gap:14px;box-shadow:0 40px 100px rgba(0,0,0,0.65)">
      <h3 style="margin:0;font-size:1rem;color:#c8ddd5">Edit Entry — <code>${entry.id}</code></h3>
      <select id="editCategory" style="padding:11px 13px;border-radius:11px;border:1px solid rgba(255,255,255,0.09);background:#0a1a12;color:#fff;font-size:.9rem">
        ${cats.map(c => `<option${c===entry.category?" selected":""}>${c}</option>`).join("")}
      </select>
      <input id="editTitle" value="${entry.title||""}" placeholder="Title" style="padding:11px 13px;border-radius:11px;border:1px solid rgba(255,255,255,0.09);background:#0a1a12;color:#fff;font-size:.9rem">
      <textarea id="editContent" rows="4" style="padding:11px 13px;border-radius:11px;border:1px solid rgba(255,255,255,0.09);background:#0a1a12;color:#fff;font-size:.9rem;font-family:inherit;resize:vertical">${entry.content}</textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="editCancel" style="padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#8aab99;cursor:pointer">Cancel</button>
        <button id="editSave"   style="padding:10px 22px;border-radius:12px;border:none;cursor:pointer;font-weight:700;background:linear-gradient(135deg,#19c37d,#4f9cff);color:#07130d">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("editCancel").onclick = () => modal.remove();
  document.getElementById("editSave").onclick = async () => {
    const payload = {
      category: document.getElementById("editCategory").value,
      title:    document.getElementById("editTitle").value.trim(),
      content:  document.getElementById("editContent").value.trim(),
    };
    if (!payload.content) { alert("Content cannot be empty."); return; }
    const res = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, {
      method: "PUT", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) { modal.remove(); await loadEntries(); }
    else { const d = await res.json(); alert(d.error || "Update failed."); }
  };
}

async function addEntry() {
  const id       = kbId?.value.trim();
  const category = kbCategory?.value.trim() || "General";
  const title    = kbTitle?.value.trim()    || "";
  const content  = kbContent?.value.trim();
  if (!id || !content) { alert("ID and Content are required."); return; }
  try {
    const res  = await fetch("/api/entries", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category, title, content }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not save entry."); return; }
    if (kbId)      kbId.value      = "";
    if (kbTitle)   kbTitle.value   = "";
    if (kbContent) kbContent.value = "";
    await loadEntries();
    alert(`Saved ✅ (${data.entry?.id || id})`);
  } catch { alert("⚠️ Could not connect to backend."); }
}

if (kbSaveBtn) kbSaveBtn.addEventListener("click", addEntry);

/* ===============================
   PLAYERS PANEL
   =============================== */
async function loadPlayers() {
  const list = document.getElementById("playerList");
  if (!list) return;
  list.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const res     = await fetch("/api/players", { credentials: "same-origin" });
    const players = await res.json();
    list.innerHTML = "";
    if (!players.length) { list.innerHTML = "<div class='trained-empty'>No players yet.</div>"; return; }
    players.forEach(p => list.appendChild(buildPlayerRow(p)));
  } catch { list.innerHTML = "<div class='trained-empty'>⚠️ Could not load players.</div>"; }
}

function buildPlayerRow(p) {
  const item = document.createElement("div");
  item.className = "trained-item";
  const text = document.createElement("div");
  text.className = "trained-item__text";
  const head = document.createElement("strong");
  head.textContent = `${p.name} ${p.squad_no ? "#" + p.squad_no : ""}`;
  const meta = document.createElement("span");
  meta.textContent = `${p.position || "—"} · Joined ${p.date_joined || "unknown"} · ${p.status}`;
  text.appendChild(head);
  text.appendChild(meta);
  if (p.email) { const em = document.createElement("span"); em.textContent = p.email; text.appendChild(em); }

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:6px;flex-shrink:0";

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "Profile";
  viewBtn.style.cssText = "background:rgba(25,195,125,0.15);color:#19c37d;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem";
  viewBtn.onclick = () => openPlayerProfile(p.id);

  const contractBtn = document.createElement("button");
  contractBtn.textContent = "Contract";
  contractBtn.style.cssText = "background:rgba(255,200,50,0.15);color:#ffc832;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem";
  contractBtn.onclick = () => openContractModal(p.id);

  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.onclick = async () => {
    if (!confirm(`Delete player ${p.name}? This will also delete all their performance and attendance records.`)) return;
    await fetch(`/api/players/${p.id}`, { method: "DELETE", credentials: "same-origin" });
    await loadPlayers();
  };

  actions.appendChild(viewBtn);
  actions.appendChild(contractBtn);
  actions.appendChild(delBtn);
  item.appendChild(text);
  item.appendChild(actions);
  return item;
}

async function addPlayer() {
  const id        = document.getElementById("plyrId")?.value.trim();
  const name      = document.getElementById("plyrName")?.value.trim();
  const position  = document.getElementById("plyrPosition")?.value.trim();
  const squad_no  = document.getElementById("plyrSquadNo")?.value.trim();
  const date_joined = document.getElementById("plyrJoined")?.value.trim();
  const email     = document.getElementById("plyrEmail")?.value.trim();
  const status    = document.getElementById("plyrStatus")?.value || "active";

  if (!id || !name) { alert("Player ID and Name are required."); return; }
  try {
    const res  = await fetch("/api/players", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, position, squad_no: squad_no || null, date_joined, email, status }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add player."); return; }
    ["plyrId","plyrName","plyrPosition","plyrSquadNo","plyrJoined","plyrEmail"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    await loadPlayers();
  } catch { alert("⚠️ Could not connect to backend."); }
}

async function openPlayerProfile(playerId) {
  try {
    const res  = await fetch(`/api/players/${playerId}`, { credentials: "same-origin" });
    const data = await res.json();
    const p    = data.player;
    const perf = data.performance || [];
    const att  = data.attendance  || [];

    const goals       = perf.reduce((s,r) => s + (r.goals||0), 0);
    const assists     = perf.reduce((s,r) => s + (r.assists||0), 0);
    const attPct      = att.length ? Math.round(100 * att.filter(a=>a.present).length / att.length) : "N/A";
    const avgRating   = perf.filter(r=>r.rating).length
      ? (perf.reduce((s,r)=>s+(r.rating||0),0) / perf.filter(r=>r.rating).length).toFixed(2)
      : "N/A";

    document.getElementById("profileModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "profileModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(4px);overflow-y:auto;padding:20px";
    modal.innerHTML = `
      <div style="width:min(96%,600px);background:rgba(10,26,18,0.99);border:1px solid rgba(255,255,255,0.1);border-radius:22px;padding:28px;display:flex;flex-direction:column;gap:16px;box-shadow:0 40px 100px rgba(0,0,0,0.7)">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <h3 style="margin:0;color:#c8ddd5;font-size:1.2rem">${p.name}</h3>
            <span style="color:#19c37d;font-size:.85rem">${p.position||"—"} · Squad #${p.squad_no||"—"}</span>
          </div>
          <button id="closeProfile" style="background:transparent;border:1px solid rgba(255,255,255,0.15);color:#8aab99;border-radius:10px;padding:6px 12px;cursor:pointer">Close</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${[["⚽ Goals",goals],["🎯 Assists",assists],["📅 Apps",perf.length],["⭐ Avg Rating",avgRating],["🏋️ Attendance",attPct+"%"],["📧 Email",p.email||"—"],["Joined",p.date_joined||"—"],["Status",p.status]]
            .map(([label,val])=>`<div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:10px;text-align:center"><div style="color:#19c37d;font-size:.72rem;margin-bottom:4px">${label}</div><div style="color:#fff;font-weight:700;font-size:.95rem">${val}</div></div>`).join("")}
        </div>

        ${perf.length ? `
        <div>
          <div style="color:#8aab99;font-size:.8rem;margin-bottom:8px;font-weight:600">RECENT PERFORMANCES</div>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">
            ${[...perf].slice(0,8).map(r=>`
              <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:.82rem">
                <span style="color:#c8ddd5">${r.match_date||"—"} vs ${r.opponent||"—"}</span>
                <span style="color:#19c37d">${r.goals}G ${r.assists}A${r.rating?" · ⭐"+r.rating:""}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("closeProfile").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  } catch { alert("Could not load player profile."); }
}

/* ===============================
   PERFORMANCE PANEL
   =============================== */
async function loadPerformance() {
  const list = document.getElementById("perfList");
  if (!list) return;
  const season = document.getElementById("perfSeasonFilter")?.value || "";
  list.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const url = "/api/performance" + (season ? `?season=${encodeURIComponent(season)}` : "");
    const res  = await fetch(url, { credentials: "same-origin" });
    const rows = await res.json();
    list.innerHTML = "";
    if (!rows.length) { list.innerHTML = "<div class='trained-empty'>No performance records yet.</div>"; return; }
    rows.forEach(r => {
      const item = document.createElement("div");
      item.className = "trained-item";
      item.innerHTML = `
        <div class="trained-item__text">
          <strong>${r.player_name} vs ${r.opponent||"—"}</strong>
          <span>${r.match_date||"—"} · ${r.season} · ${r.match_type}</span>
          <span>⚽ ${r.goals} goals &nbsp; 🎯 ${r.assists} assists &nbsp; ⏱ ${r.minutes} mins${r.rating ? " &nbsp; ⭐ "+r.rating : ""}${r.fitness_score ? " &nbsp; 🏋️ "+r.fitness_score : ""}</span>
          ${r.notes ? `<span style="opacity:.6">${r.notes}</span>` : ""}
        </div>
        <button onclick="deletePerf('${r.id}')" style="background:rgba(255,80,80,0.15);color:#ff8080;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem;flex-shrink:0">Delete</button>`;
      list.appendChild(item);
    });
  } catch { list.innerHTML = "<div class='trained-empty'>⚠️ Could not load records.</div>"; }
}

async function deletePerf(id) {
  if (!confirm("Delete this performance record?")) return;
  await fetch(`/api/performance/${id}`, { method: "DELETE", credentials: "same-origin" });
  await loadPerformance();
}

async function addPerformance() {
  const d = {
    id:          document.getElementById("perfId")?.value.trim(),
    player_id:   document.getElementById("perfPlayerId")?.value.trim(),
    season:      document.getElementById("perfSeason")?.value.trim(),
    match_date:  document.getElementById("perfDate")?.value.trim(),
    opponent:    document.getElementById("perfOpponent")?.value.trim(),
    match_type:  document.getElementById("perfType")?.value || "league",
    goals:       parseInt(document.getElementById("perfGoals")?.value) || 0,
    assists:     parseInt(document.getElementById("perfAssists")?.value) || 0,
    minutes:     parseInt(document.getElementById("perfMinutes")?.value) || 0,
    rating:      parseFloat(document.getElementById("perfRating")?.value) || null,
    fitness_score: parseFloat(document.getElementById("perfFitness")?.value) || null,
    notes:       document.getElementById("perfNotes")?.value.trim(),
  };
  if (!d.id || !d.player_id || !d.season) { alert("ID, Player ID, and Season are required."); return; }
  try {
    const res  = await fetch("/api/performance", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not save record."); return; }
    ["perfId","perfPlayerId","perfOpponent","perfGoals","perfAssists","perfMinutes","perfRating","perfFitness","perfNotes"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    await loadPerformance();
  } catch { alert("⚠️ Could not connect to backend."); }
}

/* ===============================
   COMPARE PANEL
   =============================== */
async function runCompare() {
  const playerA = document.getElementById("cmpPlayerA")?.value.trim();
  const seasonA = document.getElementById("cmpSeasonA")?.value.trim();
  const playerB = document.getElementById("cmpPlayerB")?.value.trim();
  const seasonB = document.getElementById("cmpSeasonB")?.value.trim();
  const out     = document.getElementById("compareOutput");
  if (!playerA || !seasonA) { alert("At least Player A and Season A are required."); return; }
  out.innerHTML = "<em style='opacity:.5'>Loading comparison…</em>";
  try {
    const params = new URLSearchParams({ player_a: playerA, season_a: seasonA });
    if (playerB && seasonB) { params.set("player_b", playerB); params.set("season_b", seasonB); }
    else if (seasonB)       { params.set("player_b", playerA); params.set("season_b", seasonB); }
    const res  = await fetch(`/api/performance/compare?${params}`, { credentials: "same-origin" });
    const data = await res.json();
    const renderSide = (s, label) => {
      if (!s || !s.name) return `<div style="flex:1;opacity:.4">No data found for ${label}.</div>`;
      return `
        <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:14px;padding:16px">
          <div style="color:#19c37d;font-weight:700;margin-bottom:10px">${s.name} — ${s.season}</div>
          ${[["Appearances",s.appearances],["Goals",s.goals],["Assists",s.assists],["Minutes",s.minutes],["Avg Rating",s.avg_rating],["Avg Fitness",s.avg_fitness]]
            .map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:.85rem"><span style="opacity:.6">${k}</span><span style="font-weight:600">${v ?? "—"}</span></div>`).join("")}
        </div>`;
    };
    out.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap">${renderSide(data.a,"A")}${data.b ? renderSide(data.b,"B") : ""}</div>`;
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Compare failed.</em>"; }
}

/* ===============================
   CONTRACTS PANEL
   =============================== */
async function loadTemplates() {
  const sel = document.getElementById("contractTemplate");
  if (!sel) return;
  try {
    const res       = await fetch("/api/contracts/templates", { credentials: "same-origin" });
    const templates = await res.json();
    sel.innerHTML   = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  } catch {}
}

async function generateContract() {
  const template_id = document.getElementById("contractTemplate")?.value;
  const player_id   = document.getElementById("contractPlayerId")?.value.trim();
  const season      = document.getElementById("contractSeason")?.value.trim();
  const fee         = document.getElementById("contractFee")?.value.trim();
  const out         = document.getElementById("contractOutput");

  if (!template_id) { alert("Please select a template."); return; }
  out.innerHTML = "<em style='opacity:.5'>Generating…</em>";

  try {
    const res  = await fetch("/api/contracts/generate", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id, player_id, fields: { season, fee } }),
    });
    const data = await res.json();
    if (!res.ok) { out.innerHTML = `<em style="color:#ff8080">${data.error}</em>`; return; }
    out.innerHTML = `
      <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <strong style="color:#19c37d">${data.title}</strong>
        <button onclick="copyContract()" style="background:rgba(79,156,255,0.15);color:#7ec8ff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.8rem">Copy Text</button>
      </div>
      <pre id="contractText" style="white-space:pre-wrap;font-family:monospace;font-size:.8rem;background:rgba(0,0,0,0.3);padding:16px;border-radius:12px;max-height:400px;overflow-y:auto;color:#c8ddd5">${data.content}</pre>`;
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Generation failed.</em>"; }
}

function copyContract() {
  const text = document.getElementById("contractText")?.textContent;
  if (text) navigator.clipboard.writeText(text).then(() => alert("Contract copied to clipboard!"));
}

async function loadContracts() {
  const list = document.getElementById("contractList");
  if (!list) return;
  list.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const res   = await fetch("/api/contracts", { credentials: "same-origin" });
    const items = await res.json();
    list.innerHTML = "";
    if (!items.length) { list.innerHTML = "<div class='trained-empty'>No contracts generated yet.</div>"; return; }
    items.forEach(c => {
      const item = document.createElement("div");
      item.className = "trained-item";
      item.innerHTML = `
        <div class="trained-item__text">
          <strong>${c.title}</strong>
          <span>${c.created_at?.slice(0,10)||"—"} · ${c.status}</span>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="viewSavedContract('${c.id}')" style="background:rgba(25,195,125,0.15);color:#19c37d;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem">View</button>
          <button onclick="deleteSavedContract('${c.id}')" style="background:rgba(255,80,80,0.12);color:#ff8080;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem">Delete</button>
        </div>`;
      list.appendChild(item);
    });
  } catch { list.innerHTML = "<div class='trained-empty'>⚠️ Could not load contracts.</div>"; }
}

async function viewSavedContract(id) {
  const res  = await fetch(`/api/contracts/${id}`, { credentials: "same-origin" });
  const data = await res.json();
  const out  = document.getElementById("contractOutput");
  if (out) {
    out.innerHTML = `
      <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <strong style="color:#19c37d">${data.title}</strong>
        <button onclick="copyContract()" style="background:rgba(79,156,255,0.15);color:#7ec8ff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.8rem">Copy Text</button>
      </div>
      <pre id="contractText" style="white-space:pre-wrap;font-family:monospace;font-size:.8rem;background:rgba(0,0,0,0.3);padding:16px;border-radius:12px;max-height:400px;overflow-y:auto;color:#c8ddd5">${data.content}</pre>`;
    out.scrollIntoView({ behavior: "smooth" });
  }
}

async function deleteSavedContract(id) {
  if (!confirm("Delete this contract?")) return;
  await fetch(`/api/contracts/${id}`, { method: "DELETE", credentials: "same-origin" });
  await loadContracts();
}

/* ===============================
   ANALYTICS PANEL
   =============================== */
async function loadAnalytics() {
  const out    = document.getElementById("analyticsOutput");
  const season = document.getElementById("analyticsSeason")?.value || "2024-25";
  if (!out) return;
  out.innerHTML = "<em style='opacity:.5'>Loading analytics…</em>";
  try {
    const res  = await fetch(`/api/analytics/trends?season=${encodeURIComponent(season)}`, { credentials: "same-origin" });
    const data = await res.json();

    const topScorers = data.top_scorers?.length
      ? data.top_scorers.map((p,i) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:.85rem"><span>${i+1}. ${p.name}</span><span style="color:#19c37d;font-weight:700">${p.goals}G ${p.assists}A</span></div>`).join("")
      : "<div style='opacity:.4;font-size:.85rem'>No performance data yet.</div>";

    const attMonths = data.attendance_by_month?.length
      ? data.attendance_by_month.map(m => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:.85rem"><span>${m.month}</span><span style="color:#4f9cff">${m.pct}% (${m.present}/${m.total})</span></div>`).join("")
      : "<div style='opacity:.4;font-size:.85rem'>No attendance data yet.</div>";

    const queryStats = data.query_stats?.length
      ? data.query_stats.slice(0,10).map(q => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:.82rem"><span style="opacity:.8">"${q.query}"</span><span style="color:#ffc832">${q.times_asked}x${q.matched < q.times_asked ? ' <span style="color:#ff8080">('+(q.times_asked-q.matched)+' no match)</span>' : ''}</span></div>`).join("")
      : "<div style='opacity:.4;font-size:.85rem'>No query data yet.</div>";

    out.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
        <div style="background:rgba(255,255,255,0.04);border-radius:14px;padding:16px">
          <div style="color:#19c37d;font-weight:700;margin-bottom:10px">🏆 Top Scorers — ${season}</div>
          ${topScorers}
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:14px;padding:16px">
          <div style="color:#4f9cff;font-weight:700;margin-bottom:10px">📅 Attendance by Month</div>
          ${attMonths}
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:14px;padding:16px">
          <div style="color:#ffc832;font-weight:700;margin-bottom:10px">🔍 Most Asked Questions</div>
          ${queryStats}
        </div>
      </div>`;
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Could not load analytics.</em>"; }
}

/* ===============================
   AUTH
   =============================== */
let isSignup      = false;
let role          = "user";
let passwordScore = 0;

const overlay       = document.getElementById("authOverlay");
const appEl         = document.getElementById("footbotApp");
const nameField     = document.getElementById("nameField");
const emailField    = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");
const authBtn       = document.getElementById("authBtn");
const authTitle     = document.getElementById("authTitle");
const switchText    = document.getElementById("switchText");
const switchLink    = document.getElementById("switchLink");
const strengthWrap  = document.getElementById("strengthWrap");
const strengthBar   = document.getElementById("strengthBar");
const strengthText  = document.getElementById("strengthText");

document.querySelectorAll(".role-toggle button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".role-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    role = btn.dataset.role;
  };
});

function toggleAuth(forceMode = null) {
  if      (forceMode === "signup") isSignup = true;
  else if (forceMode === "login")  isSignup = false;
  else                             isSignup = !isSignup;
  nameField.hidden    = !isSignup;
  strengthWrap.hidden = !isSignup;
  strengthText.hidden = !isSignup;
  authTitle.textContent  = isSignup ? "Create your Lumen account" : "Login to FootBot";
  authBtn.textContent    = isSignup ? "Create account"            : "Login";
  switchText.textContent = isSignup ? "Already have an account?"  : "Don't have an account?";
  switchLink.textContent = isSignup ? "Login"                     : "Sign up";
}

function togglePassword() {
  passwordField.type = passwordField.type === "password" ? "text" : "password";
}

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

passwordField.addEventListener("input", () => {
  const v = passwordField.value;
  passwordScore = 0;
  if (v.length < 8) { updateStrength(0, "Too short"); return; }
  if (/[a-z]/.test(v)) passwordScore++;
  if (/[A-Z]/.test(v)) passwordScore++;
  if (/[0-9]/.test(v)) passwordScore++;
  if (/[^A-Za-z0-9]/.test(v)) passwordScore++;
  if (/^(1234|password|qwerty)/i.test(v)) { updateStrength(1, "Very weak"); return; }
  if (/^(.)\1+$/.test(v))                 { updateStrength(1, "Repeated characters"); return; }
  if (passwordScore <= 2)       updateStrength(2, "Weak");
  else if (passwordScore === 3) updateStrength(3, "Good");
  else                          updateStrength(4, "Strong");
});

function updateStrength(level, label) {
  const colors = ["#ff4d4d","#ff4d4d","#ffa500","#4f9cff","#19c37d"];
  strengthBar.style.width      = level * 25 + "%";
  strengthBar.style.background = colors[level];
  strengthText.textContent     = label;
}

function showApp(userRole) {
  overlay.style.display = "none";
  appEl.style.display   = "flex";
  const isAdmin = userRole === "admin";
  adminPanel.hidden = !isAdmin;
  ["progressPanel","membershipPanel","playerPanel","performancePanel","comparePanel","contractPanel","analyticsPanel","aiLogPanel","aiLineupPanel","aiContractPanel"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !isAdmin; });
  if (isAdmin) {
    loadEntries();
    loadProgress();
    loadPlayers();
    loadTemplates();
    loadContracts();
    loadMemberships();
    loadAnalytics();
  }
  sendWelcomeMessage(userRole);
}

document.getElementById("authForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!isValidEmail(emailField.value)) { alert("Enter a valid email (example@domain.com)"); return; }
  if (isSignup) {
    if (passwordScore < 4) { alert("Password must be STRONG:\n• 8+ chars\n• Upper & lowercase\n• Number\n• Symbol"); return; }
    if (role === "admin") { alert("Admin accounts are pre-configured. Please log in instead."); toggleAuth("login"); return; }
    localStorage.setItem("lumenUser", JSON.stringify({ name: nameField.value, email: emailField.value, password: passwordField.value, role: "user" }));
    alert("Account created. Please login.");
    toggleAuth("login");
    return;
  }
  try {
    const res  = await fetch("/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailField.value, password: passwordField.value, role }),
    });
    const data = await res.json();
    if (res.ok) { showApp(data.role); return; }
  } catch {}
  if (role === "user") {
    const saved = JSON.parse(localStorage.getItem("lumenUser") || "null");
    if (saved && saved.email === emailField.value && saved.password === passwordField.value) { showApp("user"); return; }
  }
  alert("Invalid credentials. Please check your email and password.");
};

async function logout() {
  try { await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }); } catch {}
  overlay.style.display = "flex";
  appEl.style.display   = "none";
  emailField.value = passwordField.value = nameField.value = "";
  strengthBar.style.width = "0%";
  strengthText.textContent = "Password strength";
  role = "user"; isSignup = false;
  document.querySelectorAll(".role-toggle button").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-role="user"]').classList.add("active");
  toggleAuth("login");
}

(async () => {
  try {
    const res  = await fetch("/auth/me", { credentials: "same-origin" });
    const data = await res.json();
    if (res.ok && data.role) { showApp(data.role); return; }
  } catch {}
  appEl.style.display = "none";
})();

/* ===============================
   PROGRESS RECORDS
   =============================== */
const prgId       = document.getElementById("prgId");
const prgDate     = document.getElementById("prgDate");
const prgMember   = document.getElementById("prgMember");
const prgCategory = document.getElementById("prgCategory");
const prgValue    = document.getElementById("prgValue");
const prgNotes    = document.getElementById("prgNotes");
const prgSaveBtn  = document.getElementById("prgSaveBtn");
const prgList     = document.getElementById("prgList");

if (prgDate) prgDate.value = new Date().toISOString().split("T")[0];

async function loadProgress() {
  if (!prgList) return;
  prgList.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const res     = await fetch("/api/progress", { credentials: "same-origin" });
    const records = await res.json();
    prgList.innerHTML = "";
    if (!Array.isArray(records) || records.length === 0) {
      prgList.innerHTML = "<div class='trained-empty'>No records yet. Add one above.</div>"; return;
    }
    [...records].reverse().forEach(r => prgList.appendChild(buildProgressRow(r)));
  } catch { prgList.innerHTML = "<div class='trained-empty'>⚠️ Could not load records.</div>"; }
}

function buildProgressRow(r) {
  const item = document.createElement("div");
  item.className = "trained-item";
  const textWrap = document.createElement("div");
  textWrap.className = "trained-item__text";
  const catSlug = (r.category || "other").toLowerCase().replace(/\s+/g,"-");
  const head = document.createElement("strong");
  head.innerHTML = `${r.id} <span class="prg-cat-badge prg-cat--${catSlug}">${r.category||"—"}</span>`;
  const meta = document.createElement("span");
  meta.className   = "prg-meta";
  meta.textContent = `${r.date||"No date"} · ${r.member||"Unknown"}`;
  textWrap.appendChild(head);
  textWrap.appendChild(meta);
  if (r.value) { const val = document.createElement("span"); val.textContent = `Value: ${r.value}`; textWrap.appendChild(val); }
  if (r.notes) { const notes = document.createElement("span"); notes.className="prg-notes"; notes.textContent=r.notes; textWrap.appendChild(notes); }
  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.className   = "prg-del-btn";
  delBtn.onclick = async () => {
    if (!confirm(`Delete record ${r.id}?`)) return;
    await fetch(`/api/progress/${encodeURIComponent(r.id)}`, { method:"DELETE", credentials:"same-origin" });
    await loadProgress();
  };
  item.appendChild(textWrap);
  item.appendChild(delBtn);
  return item;
}

async function addProgressRecord() {
  const id       = prgId?.value.trim();
  const date     = prgDate?.value.trim();
  const member   = prgMember?.value.trim();
  const category = prgCategory?.value.trim() || "Training";
  const value    = prgValue?.value.trim()    || "";
  const notes    = prgNotes?.value.trim()    || "";
  if (!id)     { alert("Record ID is required."); prgId.focus();     return; }
  if (!member) { alert("Member name is required."); prgMember.focus(); return; }
  prgSaveBtn.disabled = true;
  prgSaveBtn.textContent = "Saving…";
  try {
    const res  = await fetch("/api/progress", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, date, member, category, value, notes }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not save record."); return; }
    prgId.value = prgMember.value = prgValue.value = prgNotes.value = "";
    prgDate.value = new Date().toISOString().split("T")[0];
    await loadProgress();
  } catch { alert("⚠️ Could not connect to backend."); }
  finally { prgSaveBtn.disabled = false; prgSaveBtn.textContent = "Add Record"; }
}

if (prgSaveBtn) prgSaveBtn.addEventListener("click", addProgressRecord);

/* ===============================
   AI — NATURAL LANGUAGE LOG
   =============================== */
async function aiLogMatch() {
  const desc   = document.getElementById("aiMatchDesc")?.value.trim();
  const season = document.getElementById("aiMatchSeason")?.value.trim() || "2024-25";
  const out    = document.getElementById("aiLogOutput");
  if (!desc) { alert("Please describe the match first."); return; }
  out.innerHTML = "<em style='opacity:.5'>🤖 Analysing description…</em>";
  try {
    const res  = await fetch("/api/ai/log-match", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc, season }),
    });
    const data = await res.json();
    if (!res.ok) { out.innerHTML = `<em style='color:#ff8080'>${data.error}</em>`; return; }
    if (data.saved.length === 0) {
      out.innerHTML = `<em style='color:#ff8080'>No player records could be extracted. Try being more specific with player names.</em>`;
      return;
    }
    out.innerHTML =
      `<div style='color:#19c37d;font-weight:700;margin-bottom:10px'>✅ Logged ${data.saved.length} performance record${data.saved.length > 1 ? "s" : ""}</div>` +
      data.saved.map(r => `<div style='background:rgba(255,255,255,0.04);border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:.85rem'><strong>${r.player}</strong> — ⚽ ${r.goals} goals &nbsp; 🎯 ${r.assists} assists</div>`).join("") +
      (data.errors.length ? `<div style='color:#ff8080;margin-top:8px;font-size:.8rem'>Errors: ${data.errors.join(", ")}</div>` : "");
    document.getElementById("aiMatchDesc").value = "";
    await loadPerformance();
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Could not connect.</em>"; }
}

/* ===============================
   AI — LINEUP SUGGESTER
   =============================== */
async function aiSuggestLineup() {
  const season    = document.getElementById("aiLineupSeason")?.value.trim()    || "2024-25";
  const formation = document.getElementById("aiLineupFormation")?.value.trim() || "4-3-3";
  const notes     = document.getElementById("aiLineupNotes")?.value.trim()     || "";
  const out       = document.getElementById("aiLineupOutput");
  out.innerHTML   = "<em style='opacity:.5'>🤖 Analysing squad data…</em>";
  try {
    const res  = await fetch("/api/ai/suggest-lineup", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, formation, notes }),
    });
    const data = await res.json();
    if (!res.ok) { out.innerHTML = `<em style='color:#ff8080'>${data.error}</em>`; return; }
    out.innerHTML = `
      <div style='color:#19c37d;font-weight:700;margin-bottom:10px'>🧠 AI Lineup Suggestion — ${formation}</div>
      <pre style='white-space:pre-wrap;font-size:.85rem;line-height:1.6;background:rgba(0,0,0,0.3);padding:16px;border-radius:12px;color:#c8ddd5'>${data.suggestion}</pre>`;
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Could not connect.</em>"; }
}

/* ===============================
   AI — CONTRACT INTELLIGENCE
   =============================== */
async function aiContractIntelligence() {
  const days   = document.getElementById("aiContractDays")?.value   || "60";
  const season = document.getElementById("aiContractSeason")?.value || "2024-25";
  const out    = document.getElementById("aiContractOutput");
  out.innerHTML = "<em style='opacity:.5'>🤖 Scanning contracts and analysing performance…</em>";
  try {
    const res  = await fetch(`/api/ai/contract-intelligence?days=${days}&season=${encodeURIComponent(season)}`, { credentials: "same-origin" });
    const data = await res.json();
    if (data.message) { out.innerHTML = `<div style='color:#19c37d'>${data.message}</div>`; return; }
    out.innerHTML = `
      <div style='color:#ffc832;font-weight:700;margin-bottom:10px'>⚠️ ${data.expiring_count} contract${data.expiring_count > 1 ? "s" : ""} expiring in the next ${days} days</div>
      <div style='margin-bottom:12px'>
        ${data.expiring.map(m => `<div style='background:rgba(255,200,50,0.07);border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:.82rem;border-left:3px solid #ffc832'><strong>${m.player_name}</strong> — Expires: ${m.expiry_date} &nbsp;|&nbsp; £${m.fee_paid}/£${m.fee_due} paid</div>`).join("")}
      </div>
      <div style='color:#19c37d;font-weight:700;margin-bottom:8px'>🧠 AI Recommendations</div>
      <pre style='white-space:pre-wrap;font-size:.85rem;line-height:1.6;background:rgba(0,0,0,0.3);padding:16px;border-radius:12px;color:#c8ddd5'>${data.recommendations}</pre>`;
  } catch { out.innerHTML = "<em style='color:#ff8080'>⚠️ Could not connect.</em>"; }
}

/* ===============================
   CHATBOT — AI FALLBACK
   Hook into the existing sendMessage
   so when TF-IDF fails, Ollama tries
   =============================== */
// Override the existing no-match behaviour
const _originalSend = sendMessage;
window._aiEnabled   = true;

/* ===============================
   MEMBERSHIPS
   =============================== */
async function loadMemberships() {
  const list = document.getElementById("membershipList");
  if (!list) return;
  list.innerHTML = "<div class='trained-empty'>Loading…</div>";
  try {
    const res  = await fetch("/api/memberships", { credentials: "same-origin" });
    const rows = await res.json();
    list.innerHTML = "";
    if (!rows.length) { list.innerHTML = "<div class='trained-empty'>No memberships yet. Add one above.</div>"; return; }
    rows.forEach(m => {
      const feePct    = m.fee_due > 0 ? Math.round(100 * m.fee_paid / m.fee_due) : 100;
      const feeColor  = feePct >= 100 ? "#19c37d" : feePct >= 50 ? "#ffc832" : "#ff8080";
      const item      = document.createElement("div");
      item.className  = "trained-item";
      item.innerHTML  = `
        <div class="trained-item__text">
          <strong>${m.player_name} — ${m.type} (${m.season})</strong>
          <span>ID: ${m.id} · Status: ${m.status} · Joined: ${m.join_date || "—"} · Expires: ${m.expiry_date || "—"}</span>
          <span style="color:${feeColor}">Fee: £${m.fee_paid} paid of £${m.fee_due} due (${feePct}%)</span>
          ${m.notes ? `<span style="opacity:.6">${m.notes}</span>` : ""}
        </div>
        <button onclick="deleteMembership('${m.id}')" style="background:rgba(255,80,80,0.12);color:#ff8080;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:.75rem;flex-shrink:0">Delete</button>`;
      list.appendChild(item);
    });
  } catch { list.innerHTML = "<div class='trained-empty'>⚠️ Could not load memberships.</div>"; }
}

async function addMembership() {
  const d = {
    id:          document.getElementById("memId")?.value.trim(),
    player_id:   document.getElementById("memPlayerId")?.value.trim(),
    season:      document.getElementById("memSeason")?.value.trim(),
    type:        document.getElementById("memType")?.value || "senior",
    fee_due:     parseFloat(document.getElementById("memFeeDue")?.value)  || 0,
    fee_paid:    parseFloat(document.getElementById("memFeePaid")?.value) || 0,
    join_date:   document.getElementById("memJoinDate")?.value.trim(),
    expiry_date: document.getElementById("memExpiry")?.value.trim(),
    status:      document.getElementById("memStatus")?.value || "active",
    notes:       document.getElementById("memNotes")?.value.trim(),
  };
  if (!d.id || !d.player_id || !d.season) { alert("Membership ID, Player ID, and Season are required."); return; }
  try {
    const res  = await fetch("/api/memberships", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Could not add membership."); return; }
    ["memId","memPlayerId","memSeason","memFeeDue","memFeePaid","memNotes"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("memJoinDate").value  = "";
    document.getElementById("memExpiry").value    = "";
    await loadMemberships();
  } catch { alert("⚠️ Could not connect to backend."); }
}

async function deleteMembership(id) {
  if (!confirm("Delete this membership?")) return;
  await fetch(`/api/memberships/${id}`, { method: "DELETE", credentials: "same-origin" });
  await loadMemberships();
}