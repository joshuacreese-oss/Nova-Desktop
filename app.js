
/* ============================================================
   NOVA V19 — INTEGRATED AI WORKSTATION

   FEATURES
   1. Online AI + Offline WebLLM
   2. Persistent Conversation History
   3. Memory 2.0
   4. Automatic Voice Responses
   5. Notebook — PDF, TXT, Markdown
   6. Projects and Tasks
   7. Holographic Lab
   8. Image Understanding
   9. 3D Model Viewer
   10. Supabase Authentication
   11. Private 3D Model Library
   12. Approval and Activity Management
   13. Reliable Chat and Startup
============================================================ */

(() => {
"use strict";

/* ============================================================
   1. CONFIGURATION
============================================================ */

const CONFIG = {
  model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  fallbackModel: "SmolLM2-360M-Instruct-q4f16_1-MLC",

  supabaseUrl: "https://rawnqjfpeuyncssppumk.supabase.co",

  // Keep your existing PUBLIC publishable key here.
  supabaseKey: "sb_publishable_oOlwe8T3nIqeXkhAo1IWuw_T7aEKMWQ",

  backendUrl: "https://nova-3d-backbend.onrender.com",

  storagePrefix: "nova_v19_",

  autoSpeak: true,
  maxHistory: 100,
  maxMemory: 100,
  maxNotebookCharacters: 45000
};

/* ============================================================
   2. STORAGE
============================================================ */

const Store = {
  get(key, fallback = []) {
    try {
      let value = localStorage.getItem(
        CONFIG.storagePrefix + key
      );

      if (value === null) {
        value = localStorage.getItem("nova_v18_" + key);
      }

      if (value === null) {
        value = localStorage.getItem("nova_v17_" + key);
      }

      return value === null ? fallback : JSON.parse(value);

    } catch (error) {
      console.error("Storage read error:", error);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(
        CONFIG.storagePrefix + key,
        JSON.stringify(value)
      );

      return true;

    } catch (error) {
      console.error("Storage write error:", error);
      notify("Storage is full. Some information could not be saved.");
      return false;
    }
  }
};

function normalizeMemory(memory) {
  if (!Array.isArray(memory)) return [];

  return memory.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: "memory_" + index,
        content: item,
        category: "general",
        pinned: false,
        date: new Date().toISOString()
      };
    }

    return {
      id: item.id || "memory_" + index,
      content: String(item.content || ""),
      category: item.category || "general",
      pinned: Boolean(item.pinned),
      date: item.date || new Date().toISOString()
    };
  }).filter(item => item.content.trim());
}

const State = {
  messages: Store.get("messages", []),

  conversations: Store.get("conversations", []),

  activeConversationId: Store.get("activeConversationId", null),

  memory: normalizeMemory(Store.get("memory", [])),

  projects: Store.get("projects", []),
  tasks: Store.get("tasks", []),
  activity: Store.get("activity", []),
  approvals: Store.get("approvals", []),

  notebook: Store.get("notebook", []),
  activeNotebookId: null,

  engine: null,
  engineLoading: false,
  generating: false,

  recognition: null,
  supabase: null,
  session: null,

  autoSpeak: Store.get("autoSpeak", CONFIG.autoSpeak)
};

Store.set("memory", State.memory);

/* ============================================================
   3. UTILITIES
============================================================ */

const $ = selector => document.querySelector(selector);

const makeId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : "nova_" + Date.now() + "_" + Math.random().toString(16).slice(2);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function createElement(tag, attributes = {}, content = "") {
  const element = document.createElement(tag);

  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "className") {
      element.className = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  element.innerHTML = content;

  return element;
}

function notify(message) {
  console.log("NOVA:", message);

  if (!document.body) return;

  let notice = $("#novaNotice");

  if (!notice) {
    notice = createElement("div", { id: "novaNotice" });

    Object.assign(notice.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "999999",
      background: "#071b2b",
      color: "#55eaff",
      border: "1px solid #16bce8",
      padding: "12px 18px",
      borderRadius: "10px",
      fontFamily: "Arial, sans-serif",
      maxWidth: "90%",
      textAlign: "center"
    });

    document.body.appendChild(notice);
  }

  notice.textContent = message;
  notice.style.display = "block";

  clearTimeout(notice._timeout);

  notice._timeout = setTimeout(() => {
    notice.style.display = "none";
  }, 3500);
}

function logActivity(message) {
  State.activity.unshift({
    message,
    date: new Date().toISOString()
  });

  State.activity = State.activity.slice(0, 100);

  Store.set("activity", State.activity);
}

/* ============================================================
   4. CHAT DISPLAY
============================================================ */

function getChatElement() {
  return $("#chat") || $("#chatMessages") || $(".chat-messages");
}

function saveMessages() {
  Store.set("messages", State.messages);
}

function displayStoredMessages() {
  const chat = getChatElement();

  if (!chat) {
    console.warn("NOVA: Chat container not found.");
    return;
  }

  chat.innerHTML = "";

  State.messages.forEach(message => {
    renderMessage(message);
  });
}

function renderMessage(message) {
  const chat = getChatElement();

  if (!chat) return;

  const wrapper = document.createElement("div");

  wrapper.className = "nova-message";
  wrapper.dataset.role = message.role;

  Object.assign(wrapper.style, {
    margin: "12px 0",
    padding: "12px",
    borderRadius: "10px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    background: message.role === "user"
      ? "rgba(0,180,255,0.12)"
      : "rgba(0,255,220,0.07)",
    border: "1px solid rgba(70,220,255,0.2)"
  });

  const label = document.createElement("strong");

  label.textContent =
    message.role === "user" ? "YOU" : "NOVA";

  const content = document.createElement("div");

  content.textContent = message.content || "";
  content.style.marginTop = "6px";

  wrapper.append(label, content);

  if (message.searchedWeb) {
    const badge = document.createElement("div");

    badge.textContent = "WEB SEARCH USED";
    badge.style.cssText =
      "font-size:12px;color:#39dfff;margin-top:10px;";

    wrapper.appendChild(badge);
  }

  if (Array.isArray(message.citations)) {
    const sources = document.createElement("div");

    sources.style.marginTop = "10px";

    message.citations.forEach((source, index) => {
      try {
        const url = new URL(source.url);

        if (!["https:", "http:"].includes(url.protocol)) return;

        const link = document.createElement("a");

        link.href = url.href;
        link.textContent =
          `${index + 1}. ${source.title || "Source"}`;

        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.style.cssText =
          "display:block;color:#39dfff;margin-top:6px;";

        sources.appendChild(link);

      } catch {
        // Ignore invalid URLs.
      }
    });

    if (sources.children.length) {
      wrapper.appendChild(sources);
    }
  }

  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(role, content, citations = [], searchedWeb = false) {
  const message = {
    id: makeId(),
    role,
    content: String(content),
    citations: Array.isArray(citations) ? citations : [],
    searchedWeb: Boolean(searchedWeb),
    timestamp: new Date().toISOString()
  };

  State.messages.push(message);

  saveMessages();
  renderMessage(message);
  updateActiveConversation();

  return message;
}

/* ============================================================
   5. CONVERSATION HISTORY
============================================================ */

function saveConversationList() {
  Store.set("conversations", State.conversations);
  Store.set("activeConversationId", State.activeConversationId);
}

function createConversation() {
  const conversation = {
    id: makeId(),
    title: "New conversation",
    messages: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  State.conversations.unshift(conversation);

  State.activeConversationId = conversation.id;
  State.messages = [];

  saveMessages();
  saveConversationList();

  displayStoredMessages();
  renderConversationHistory();

  return conversation;
}

function updateActiveConversation() {
  if (!State.messages.length) return;

  let conversation = State.conversations.find(
    item => item.id === State.activeConversationId
  );

  if (!conversation) {
    conversation = {
      id: makeId(),
      title: "New conversation",
      messages: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    State.activeConversationId = conversation.id;
    State.conversations.unshift(conversation);
  }

  conversation.messages = [...State.messages];

  conversation.updated = new Date().toISOString();

  const firstUserMessage = State.messages.find(
    item => item.role === "user"
  );

  if (firstUserMessage && conversation.title === "New conversation") {
    conversation.title =
      firstUserMessage.content.slice(0, 45);
  }

  State.conversations = State.conversations.filter(
    item => item.id !== conversation.id
  );

  State.conversations.unshift(conversation);

  State.conversations = State.conversations.slice(
    0,
    CONFIG.maxHistory
  );

  saveConversationList();
  renderConversationHistory();
}

function openConversation(id) {
  if (State.generating) {
    notify("Wait for the current response to finish.");
    return;
  }

  const conversation = State.conversations.find(
    item => item.id === id
  );

  if (!conversation) return;

  State.activeConversationId = id;
  State.messages = [...conversation.messages];

  saveMessages();
  saveConversationList();

  displayStoredMessages();
  renderConversationHistory();

  notify("Conversation opened.");
}

function deleteConversation(id) {
  State.conversations = State.conversations.filter(
    item => item.id !== id
  );

  if (State.activeConversationId === id) {
    State.activeConversationId = null;
    State.messages = [];

    saveMessages();
    displayStoredMessages();
  }

  saveConversationList();
  renderConversationHistory();

  notify("Conversation deleted.");
}

function renameConversation(id) {
  const conversation = State.conversations.find(
    item => item.id === id
  );

  if (!conversation) return;

  const name = prompt("Enter a new conversation name:");

  if (!name || !name.trim()) return;

  conversation.title = name.trim();

  saveConversationList();
  renderConversationHistory();
}

function renderConversationHistory() {
  const container = $("#novaHistoryList");

  if (!container) return;

  container.innerHTML = "";

  if (!State.conversations.length) {
    container.textContent = "No saved conversations.";
    return;
  }

  State.conversations.forEach(conversation => {
    const card = document.createElement("div");

    card.style.cssText =
      "padding:10px;margin:7px 0;border:1px solid #147e9b;border-radius:8px;";

    const title = document.createElement("strong");
    title.textContent = conversation.title;

    const open = document.createElement("button");
    open.textContent = "Open";
    open.dataset.openConversation = conversation.id;

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.dataset.renameConversation = conversation.id;

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.dataset.deleteConversation = conversation.id;

    card.append(title, document.createElement("br"), open, rename, remove);

    container.appendChild(card);
  });
}

function createHistoryPanel() {
  let panel = $("#novaHistoryPanel");

  if (panel) {
    panel.style.display = "block";
    return;
  }

  panel = createElement("section", {
    id: "novaHistoryPanel"
  }, `
    <h2>NOVA CONVERSATION HISTORY</h2>
    <button id="novaNewConversation">New Conversation</button>
    <div id="novaHistoryList"></div>
  `);

  stylePanel(panel, 650);

  document.body.appendChild(panel);

  renderConversationHistory();
}

/* ============================================================
   6. MEMORY 2.0
============================================================ */

function remember(text, category = "general") {
  const content = String(text || "").trim();

  if (!content) return null;

  const existing = State.memory.find(item =>
    item.content.toLowerCase() === content.toLowerCase()
  );

  if (existing) {
    existing.date = new Date().toISOString();

    Store.set("memory", State.memory);

    return existing;
  }

  const item = {
    id: makeId(),
    content,
    category,
    pinned: false,
    date: new Date().toISOString()
  };

  State.memory.push(item);

  State.memory = State.memory.slice(-CONFIG.maxMemory);

  Store.set("memory", State.memory);

  logActivity("Memory saved");

  return item;
}

function searchMemory(query) {
  const term = String(query || "").toLowerCase().trim();

  if (!term) return [...State.memory];

  return State.memory.filter(item =>
    item.content.toLowerCase().includes(term) ||
    item.category.toLowerCase().includes(term)
  );
}

function forgetMemory(query) {
  const term = String(query || "").toLowerCase().trim();

  if (!term) return 0;

  const before = State.memory.length;

  State.memory = State.memory.filter(item =>
    !item.content.toLowerCase().includes(term)
  );

  Store.set("memory", State.memory);

  return before - State.memory.length;
}

function pinMemory(query, pinned = true) {
  const term = String(query || "").toLowerCase().trim();

  const item = State.memory.find(memory =>
    memory.content.toLowerCase().includes(term)
  );

  if (!item) return false;

  item.pinned = pinned;

  Store.set("memory", State.memory);

  return true;
}

function getMemoryContext() {
  const memories = [...State.memory].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return new Date(b.date) - new Date(a.date);
  });

  if (!memories.length) return "";

  return "\n\nNOVA LONG-TERM MEMORY\n" +
    memories.slice(0, 40).map(item =>
      `[${item.category}] ${item.content}`
    ).join("\n") +
    "\nEND MEMORY";
}

function processMemoryCommand(input) {
  const text = String(input || "").trim();

  let match;

  match = text.match(/^remember(?: that)?\s+(.+)/i);

  if (match) {
    const item = remember(match[1]);

    addMessage(
      "assistant",
      item
        ? "Memory saved successfully."
        : "I couldn't save that memory."
    );

    return true;
  }

  if (/^(show|list|view) memories$|^show memory$/i.test(text)) {
    const list = State.memory.length
      ? State.memory.map((item, index) =>
          `${index + 1}. ${item.pinned ? "[PINNED] " : ""}${item.content}`
        ).join("\n")
      : "My memory is currently empty.";

    addMessage("assistant", list);

    return true;
  }

  match = text.match(/^(?:search|find) memory(?: for)?\s+(.+)/i);

  if (match) {
    const results = searchMemory(match[1]);

    addMessage(
      "assistant",
      results.length
        ? results.map(item => item.content).join("\n")
        : "I couldn't find a matching memory."
    );

    return true;
  }

  match = text.match(/^forget memory(?: about)?\s+(.+)/i);

  if (match) {
    const removed = forgetMemory(match[1]);

    addMessage(
      "assistant",
      removed
        ? `Removed ${removed} matching memory item(s).`
        : "I couldn't find that memory."
    );

    return true;
  }

  match = text.match(/^pin memory\s+(.+)/i);

  if (match) {
    addMessage(
      "assistant",
      pinMemory(match[1])
        ? "Memory pinned."
        : "I couldn't find that memory."
    );

    return true;
  }

  if (/^clear memory$/i.test(text)) {
    State.memory = [];

    Store.set("memory", State.memory);

    addMessage("assistant", "All local memories cleared.");

    return true;
  }

  return false;
}

function createMemoryPanel() {
  let panel = $("#novaMemoryPanel");

  if (panel) {
    panel.style.display = "block";
    renderMemoryList();
    return;
  }

  panel = createElement("section", {
    id: "novaMemoryPanel"
  }, `
    <h2>NOVA MEMORY 2.0</h2>

    <input id="novaMemorySearch"
      placeholder="Search memories..."
      style="width:100%;box-sizing:border-box;">

    <input id="novaMemoryInput"
      placeholder="Add a memory..."
      style="width:100%;box-sizing:border-box;">

    <button id="novaSaveMemory">Save Memory</button>

    <div id="novaMemoryList"></div>
  `);

  stylePanel(panel, 650);
  document.body.appendChild(panel);

  renderMemoryList();
}

function renderMemoryList() {
  const container = $("#novaMemoryList");

  if (!container) return;

  const term = $("#novaMemorySearch")?.value || "";

  const items = searchMemory(term);

  container.innerHTML = "";

  if (!items.length) {
    container.textContent = "No matching memories.";
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");

    card.style.cssText =
      "padding:10px;margin:7px 0;border:1px solid #147e9b;border-radius:8px;";

    const text = document.createElement("p");
    text.textContent =
      (item.pinned ? "PINNED — " : "") + item.content;

    const pin = document.createElement("button");
    pin.textContent = item.pinned ? "Unpin" : "Pin";
    pin.dataset.toggleMemoryPin = item.id;

    const remove = document.createElement("button");
    remove.textContent = "Forget";
    remove.dataset.deleteMemory = item.id;

    card.append(text, pin, remove);
    container.appendChild(card);
  });
}

/* ============================================================
   7. VOICE INPUT AND AUTOMATIC VOICE OUTPUT
============================================================ */

function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    notify("Voice recognition is not supported in this browser.");
    return;
  }

  if (State.recognition) {
    State.recognition.stop();
    State.recognition = null;
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;

    const prompt = $("#prompt");

    if (prompt) {
      prompt.value = transcript;
      prompt.focus();
    }
  };

  recognition.onerror = error => {
    console.error("Voice input error:", error);
    notify("Voice input failed.");
  };

  recognition.onend = () => {
    State.recognition = null;
  };

  State.recognition = recognition;

  try {
    recognition.start();
    notify("Listening...");
  } catch (error) {
    State.recognition = null;
    notify("Could not start voice input.");
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    notify("Speech output is not supported.");
    return;
  }

  const cleanText = String(text || "").trim();

  if (!cleanText) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanText);

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function toggleAutoSpeak() {
  State.autoSpeak = !State.autoSpeak;

  Store.set("autoSpeak", State.autoSpeak);

  if (!State.autoSpeak) {
    stopSpeaking();
  }

  updateVoiceButton();

  notify(
    State.autoSpeak
      ? "Automatic voice enabled."
      : "Automatic voice disabled."
  );
}

function updateVoiceButton() {
  const button = $("#novaAutoSpeak");

  if (button) {
    button.textContent =
      State.autoSpeak ? "Voice: ON" : "Voice: OFF";
  }
}

/* ============================================================
   8. WEBLLM ENGINE
============================================================ */

async function initializeAI() {
  if (State.engine) return State.engine;

  if (State.engineLoading) return null;

  State.engineLoading = true;

  notify("Initializing NOVA AI...");

  try {
    const webllm = await import(
      "https://esm.run/@mlc-ai/web-llm"
    );

    let lastError;

    for (const model of [
      CONFIG.model,
      CONFIG.fallbackModel
    ]) {
      try {
        State.engine = await webllm.CreateMLCEngine(model, {
          initProgressCallback(progress) {
            const status = $(".status");

            if (status) {
              status.textContent =
                progress.text || "Loading AI...";
            }
          }
        });

        logActivity("Offline AI initialized: " + model);

        notify("Offline AI ready.");

        return State.engine;

      } catch (error) {
        lastError = error;
        console.warn("Model failed:", model, error);
      }
    }

    throw lastError || new Error("No model could be loaded.");

  } catch (error) {
    console.error("AI initialization error:", error);

    notify("Offline AI could not initialize.");

    return null;

  } finally {
    State.engineLoading = false;
  }
}

/* ============================================================
   9. BACKEND REQUESTS
============================================================ */

async function backendRequest(path, options = {}) {
  if (!State.session?.access_token) {
    throw new Error("Sign in before using this service.");
  }

  const headers = new Headers(options.headers || {});

  headers.set(
    "Authorization",
    "Bearer " + State.session.access_token
  );

  const response = await fetch(
    CONFIG.backendUrl + path,
    {
      ...options,
      headers
    }
  );

  const contentType =
    response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      "Backend request failed."
    );
  }

  return data;
}

/* ============================================================
   10. NOTEBOOK — DOCUMENT UPLOAD
============================================================ */

function createNotebookPanel() {
  let panel = $("#novaNotebook");

  if (panel) {
    panel.style.display = "block";
    renderNotebookFiles();
    return;
  }

  panel = createElement("section", {
    id: "novaNotebook"
  }, `
    <h2>NOVA NOTEBOOK</h2>

    <p>Upload a document and ask NOVA questions about its contents.</p>

    <input
      id="novaNotebookFile"
      type="file"
      accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
      multiple
    >

    <button id="novaNotebookUpload">Add Documents</button>

    <div id="novaNotebookFiles"></div>

    <hr>

    <textarea
      id="novaNotebookQuestion"
      placeholder="Ask a question about your documents..."
      style="width:100%;min-height:90px;box-sizing:border-box;"
    ></textarea>

    <button id="novaNotebookAsk">Ask NOVA About Documents</button>

    <p id="novaNotebookStatus"></p>
  `);

  stylePanel(panel, 720);

  document.body.appendChild(panel);

  renderNotebookFiles();
}

async function extractPDFText(file) {
  const pdfjs = await import(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"
  );

  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buffer
  }).promise;

  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const content = await page.getTextContent();

    text += content.items
      .map(item => item.str)
      .join(" ") + "\n";
  }

  return text;
}

async function extractDocumentText(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return await extractPDFText(file);
  }

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    return await file.text();
  }

  throw new Error("Supported formats: PDF, TXT, and Markdown.");
}

async function uploadNotebookDocuments() {
  const input = $("#novaNotebookFile");

  const files = Array.from(input?.files || []);

  if (!files.length) {
    notify("Choose a document first.");
    return;
  }

  const status = $("#novaNotebookStatus");

  for (const file of files) {
    try {
      if (status) {
        status.textContent = "Reading " + file.name + "...";
      }

      const text = await extractDocumentText(file);

      if (!text.trim()) {
        throw new Error("No readable text was found in this document.");
      }

      const documentItem = {
        id: makeId(),
        name: file.name,
        text: text.slice(0, CONFIG.maxNotebookCharacters),
        characters: text.length,
        date: new Date().toISOString()
      };

      State.notebook.push(documentItem);

      State.activeNotebookId = documentItem.id;

      Store.set("notebook", State.notebook);

      logActivity("Notebook document added: " + file.name);

    } catch (error) {
      console.error("Notebook upload error:", error);
      notify(file.name + ": " + error.message);
    }
  }

  if (status) {
    status.textContent = "Document processing complete.";
  }

  input.value = "";

  renderNotebookFiles();

  notify("Notebook updated.");
}

function renderNotebookFiles() {
  const container = $("#novaNotebookFiles");

  if (!container) return;

  container.innerHTML = "";

  if (!State.notebook.length) {
    container.textContent = "No documents uploaded.";
    return;
  }

  State.notebook.forEach(item => {
    const card = document.createElement("div");

    card.style.cssText =
      "padding:10px;margin:7px 0;border:1px solid #147e9b;border-radius:8px;";

    const name = document.createElement("strong");
    name.textContent = item.name;

    const info = document.createElement("p");
    info.textContent =
      `${item.characters.toLocaleString()} characters`;

    const use = document.createElement("button");
    use.textContent = "Use Document";
    use.dataset.useNotebook = item.id;

    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.dataset.removeNotebook = item.id;

    card.append(name, info, use, remove);

    container.appendChild(card);
  });
}

function removeNotebookDocument(id) {
  State.notebook = State.notebook.filter(
    item => item.id !== id
  );

  if (State.activeNotebookId === id) {
    State.activeNotebookId = null;
  }

  Store.set("notebook", State.notebook);

  renderNotebookFiles();

  notify("Document removed.");
}

async function askNotebook() {
  const question = $("#novaNotebookQuestion")?.value.trim();

  if (!question) {
    notify("Enter a question first.");
    return;
  }

  if (!State.notebook.length) {
    notify("Upload a document first.");
    return;
  }

  const selected = State.notebook.find(
    item => item.id === State.activeNotebookId
  ) || State.notebook[State.notebook.length - 1];

  const context =
    "\n\nNOTEBOOK DOCUMENT: " + selected.name +
    "\nDOCUMENT CONTENT:\n" +
    selected.text +
    "\nEND DOCUMENT CONTENT.\n" +
    "Answer the user's question using the document. " +
    "If the answer is not in the document, say so clearly.";

  const input = $("#prompt");

  if (!input) {
    notify("Chat prompt field not found.");
    return;
  }

  input.value =
    "Using my Notebook document \"" + selected.name +
    "\", answer this question:\n" + question;

  State.notebookContext = context;

  await sendMessage();

  State.notebookContext = "";
}

/* ============================================================
   11. SEND MESSAGE
============================================================ */

async function sendMessage() {
  if (State.generating) return;

  const promptInput = $("#prompt");

  if (!promptInput) {
    notify("Prompt field not found.");
    return;
  }

  const text = promptInput.value.trim();

  if (!text) {
    notify("Type a message first.");
    promptInput.focus();
    return;
  }

  State.generating = true;

  const sendButton = $("#sendBtn");
  const originalButtonText = sendButton?.textContent || "Send";

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "Thinking...";
  }

  promptInput.value = "";

  addMessage("user", text);

  try {
    if (processMemoryCommand(text)) return;

    const history = State.messages
      .slice(-12)
      .map(message => ({
        role: message.role === "assistant"
          ? "assistant"
          : "user",
        content: message.content
      }));

    let answer = "";
    let citations = [];
    let searchedWeb = false;
    let onlineSuccess = false;

    const memoryContext = getMemoryContext();

    const notebookContext = State.notebookContext || "";

    // ONLINE AI
    if (State.session?.access_token) {
      try {
        notify("Connecting to NOVA Online AI...");

        const result = await backendRequest("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: history,
            memoryContext: memoryContext + notebookContext
          })
        });

        if (!result?.answer) {
          throw new Error("Online AI returned an empty response.");
        }

        answer = result.answer;
        citations = result.citations || [];
        searchedWeb = result.searchedWeb || false;

        onlineSuccess = true;

        logActivity("Online AI response generated.");

      } catch (error) {
        console.warn("Online AI unavailable:", error);

        notify("Online AI unavailable. Trying offline AI.");
      }
    }

    // OFFLINE WEBLLM
    if (!onlineSuccess) {
      const engine = await initializeAI();

      if (!engine) {
        throw new Error(
          "No AI engine is available. Check your connection or sign in."
        );
      }

      const systemPrompt = {
        role: "system",
        content:
          "You are NOVA, a helpful personal AI assistant. " +
          "Answer clearly and accurately. " +
          "Use saved memories when relevant. " +
          "Do not claim to perform actions you have not performed.\n" +
          memoryContext +
          notebookContext
      };

      const response = await engine.chat.completions.create({
        messages: [systemPrompt, ...history],
        temperature: 0.7,
        max_tokens: 900
      });

      answer =
        response.choices?.[0]?.message?.content ||
        "I couldn't generate a response.";

      logActivity("Offline AI response generated.");
    }

    addMessage("assistant", answer, citations, searchedWeb);

    if (State.autoSpeak) {
      speak(answer);
    }

  } catch (error) {
    console.error("NOVA AI error:", error);

    const errorMessage =
      "NOVA encountered an error: " + error.message;

    addMessage("assistant", errorMessage);

    if (State.autoSpeak) {
      speak(errorMessage);
    }

  } finally {
    State.generating = false;

    const currentButton = $("#sendBtn");

    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = originalButtonText;
    }

    $("#prompt")?.focus();
  }
}

/* ============================================================
   12. IMAGE UNDERSTANDING
============================================================ */

async function understandImage(file) {
  if (!file) return;

  notify("Analyzing image...");

  let imageUrl;

  try {
    imageUrl = URL.createObjectURL(file);

    const transformers = await import(
      "https://esm.sh/@xenova/transformers"
    );

    const captioner = await transformers.pipeline(
      "image-to-text",
      "Xenova/vit-gpt2-image-captioning"
    );

    const result = await captioner(imageUrl);

    const description =
      result?.[0]?.generated_text ||
      "I couldn't identify the image.";

    addMessage(
      "assistant",
      "Image analysis: " + description
    );

    if (State.autoSpeak) speak(description);

    logActivity("Image analyzed");

  } catch (error) {
    console.error("Image analysis error:", error);
    notify("Image analysis failed.");

  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }
}

/* ============================================================
   13. PROJECTS AND TASKS
============================================================ */

function createProject(name, description = "") {
  if (!name?.trim()) return null;

  const project = {
    id: makeId(),
    name: name.trim(),
    description,
    created: new Date().toISOString()
  };

  State.projects.push(project);

  Store.set("projects", State.projects);

  logActivity("Project created: " + project.name);

  return project;
}

function deleteProject(id) {
  State.projects = State.projects.filter(
    item => item.id !== id
  );

  Store.set("projects", State.projects);
}

function createTask(title, description = "") {
  if (!title?.trim()) return null;

  const task = {
    id: makeId(),
    title: title.trim(),
    description,
    completed: false,
    created: new Date().toISOString()
  };

  State.tasks.push(task);

  Store.set("tasks", State.tasks);

  logActivity("Task created: " + task.title);

  return task;
}

function completeTask(id) {
  const task = State.tasks.find(item => item.id === id);

  if (!task) return;

  task.completed = true;

  Store.set("tasks", State.tasks);

  logActivity("Task completed: " + task.title);
}

function deleteTask(id) {
  State.tasks = State.tasks.filter(
    item => item.id !== id
  );

  Store.set("tasks", State.tasks);
}

/* ============================================================
   14. APPROVAL SYSTEM
============================================================ */

function requestApproval(action, details = "") {
  const approval = {
    id: makeId(),
    action,
    details,
    approved: false,
    status: "pending",
    created: new Date().toISOString()
  };

  State.approvals.push(approval);

  Store.set("approvals", State.approvals);

  logActivity("Approval requested: " + action);

  return approval;
}

function approveAction(id) {
  const item = State.approvals.find(
    approval => approval.id === id
  );

  if (!item) return;

  item.approved = true;
  item.status = "approved";

  Store.set("approvals", State.approvals);

  logActivity("Action approved: " + item.action);
}

function rejectAction(id) {
  const item = State.approvals.find(
    approval => approval.id === id
  );

  if (!item) return;

  item.status = "rejected";

  Store.set("approvals", State.approvals);

  logActivity("Action rejected: " + item.action);
}

/* ============================================================
   15. PANEL STYLING AND CLOSE SYSTEM
============================================================ */

function stylePanel(panel, maxWidth = 650) {
  Object.assign(panel.style, {
    position: "fixed",
    top: "5%",
    left: "5%",
    width: "90%",
    maxWidth: maxWidth + "px",
    maxHeight: "90vh",
    overflowY: "auto",
    zIndex: "99990",
    padding: "20px",
    boxSizing: "border-box",
    background: "#061421",
    color: "#65eaff",
    border: "1px solid #12c8ef",
    borderRadius: "14px",
    fontFamily: "Arial, sans-serif"
  });

  return panel;
}

function addCloseButton(panel) {
  if (!panel || panel.querySelector(".nova-close-button")) return;

  const close = document.createElement("button");

  close.type = "button";
  close.className = "nova-close-button";
  close.dataset.novaClose = "true";
  close.textContent = "✕";

  close.style.cssText =
    "position:absolute;top:10px;right:10px;width:38px;height:38px;" +
    "background:#09283b;color:#65eaff;border:1px solid #20cfff;" +
    "border-radius:9px;font-size:20px;cursor:pointer;z-index:100000;";

  panel.style.position = "fixed";

  panel.appendChild(close);
}

function closePanel(panel) {
  if (!panel) return;

  panel.remove();

  logActivity("Panel closed: " + panel.id);
}

function installPanelCloseSystem() {
  if (window.__NOVA_V19_CLOSE_SYSTEM__) return;

  window.__NOVA_V19_CLOSE_SYSTEM__ = true;

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-nova-close]");

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    closePanel(button.closest("section"));
  }, true);

  const observer = new MutationObserver(() => {
    document.querySelectorAll(
      "#novaLab, #novaModelViewer, #novaAccountPanel, " +
      "#novaHistoryPanel, #novaMemoryPanel, #novaNotebook"
    ).forEach(addCloseButton);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/* ============================================================
   16. HOLOGRAPHIC LAB
============================================================ */

function createLabPanel() {
  if ($("#novaLab")) {
    $("#novaLab").style.display = "block";
    return;
  }

  const panel = createElement("section", {
    id: "novaLab"
  }, `
    <h2>NOVA HOLOGRAPHIC LAB</h2>

    <p>Generate and manage visual project concepts.</p>

    <textarea id="novaLabPrompt"
      placeholder="Describe your concept..."
      style="width:100%;min-height:90px;box-sizing:border-box;"></textarea>

    <button id="novaLabGenerate">Generate Concept</button>

    <div id="novaLabResult"></div>
  `);

  stylePanel(panel, 650);

  document.body.appendChild(panel);

  addCloseButton(panel);
}

async function generateLabConcept() {
  const prompt = $("#novaLabPrompt")?.value.trim();

  if (!prompt) {
    notify("Enter a concept first.");
    return;
  }

  const result = $("#novaLabResult");

  if (result) result.textContent = "Connecting to NOVA...";

  try {
    const data = await backendRequest(
      "/api/generate/text",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      }
    );

    if (result) {
      result.textContent = data.text || JSON.stringify(data);
    }

  } catch (error) {
    console.error("Lab error:", error);

    if (result) {
      result.textContent = error.message;
    }
  }
}

/* ============================================================
   17. 3D MODEL VIEWER
============================================================ */

function createModelViewer() {
  if ($("#novaModelViewer")) {
    $("#novaModelViewer").style.display = "block";
    return;
  }

  const panel = createElement("section", {
    id: "novaModelViewer"
  }, `
    <h2>NOVA 3D VIEWER</h2>

    <input id="novaModelUrl"
      placeholder="Paste a GLB or GLTF HTTPS URL"
      style="width:100%;box-sizing:border-box;">

    <button id="novaLoadModel">Load Model</button>

    <model-viewer id="novaModel"
      camera-controls
      auto-rotate
      shadow-intensity="1"
      style="width:100%;height:350px;background:#081725;">
    </model-viewer>
  `);

  stylePanel(panel, 700);

  document.body.appendChild(panel);

  addCloseButton(panel);

  if (!$("#novaModelViewerScript")) {
    const script = document.createElement("script");

    script.id = "novaModelViewerScript";
    script.type = "module";
    script.src =
      "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";

    document.head.appendChild(script);
  }
}

function loadModel(url) {
  if (!url || !/^https:\/\//i.test(url)) {
    notify("Enter a valid HTTPS model URL.");
    return;
  }

  createModelViewer();

  const viewer = $("#novaModel");

  if (viewer) {
    viewer.src = url;
    notify("Loading 3D model...");
  }
}

/* ============================================================
   18. SUPABASE AUTHENTICATION
============================================================ */

async function initializeSupabase() {
  if (State.supabase) return State.supabase;

  try {
    const library = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );

    State.supabase = library.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseKey
    );

    const { data, error } =
      await State.supabase.auth.getSession();

    if (error) throw error;

    State.session = data.session;

    State.supabase.auth.onAuthStateChange(
      (_event, session) => {
        State.session = session;
        updateAccountStatus();
      }
    );

    updateAccountStatus();

    return State.supabase;

  } catch (error) {
    console.error("Supabase error:", error);

    notify("Account service could not initialize.");

    return null;
  }
}

function updateAccountStatus() {
  const status = $("#novaAccountStatus");

  if (!status) return;

  status.textContent = State.session
    ? "Signed in: " + State.session.user.email
    : "Not signed in";
}

async function signUp(email, password) {
  if (!email || !password) {
    notify("Enter an email and password.");
    return;
  }

  const client = await initializeSupabase();

  if (!client) return;

  const { data, error } = await client.auth.signUp({
    email,
    password
  });

  if (error) {
    notify(error.message);
    return;
  }

  State.session = data.session;

  updateAccountStatus();

  notify(
    data.session
      ? "Account created."
      : "Check your email to confirm your account."
  );
}

async function signIn(email, password) {
  if (!email || !password) {
    notify("Enter an email and password.");
    return;
  }

  const client = await initializeSupabase();

  if (!client) return;

  const { data, error } =
    await client.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    notify(error.message);
    return;
  }

  State.session = data.session;

  updateAccountStatus();

  notify("Signed in successfully.");

  await loadPrivateModels();
}

async function signOut() {
  if (!State.supabase) return;

  const { error } = await State.supabase.auth.signOut();

  if (error) {
    notify(error.message);
    return;
  }

  State.session = null;

  updateAccountStatus();

  notify("Signed out.");
}

/* ============================================================
   19. ACCOUNT AND PRIVATE MODEL LIBRARY
============================================================ */

function createAccountPanel() {
  if ($("#novaAccountPanel")) {
    $("#novaAccountPanel").style.display = "block";
    return;
  }

  const panel = createElement("section", {
    id: "novaAccountPanel"
  }, `
    <h2>NOVA ACCOUNT & MODEL LIBRARY</h2>

    <p id="novaAccountStatus">Checking account...</p>

    <input id="novaEmail" type="email"
      placeholder="Email address"
      style="width:100%;margin:5px 0;box-sizing:border-box;">

    <input id="novaPassword" type="password"
      placeholder="Password"
      style="width:100%;margin:5px 0;box-sizing:border-box;">

    <button id="novaSignUp">Create Account</button>
    <button id="novaSignIn">Sign In</button>
    <button id="novaSignOut">Sign Out</button>

    <hr>

    <h3>Private 3D Model Library</h3>

    <input id="novaModelFile" type="file" accept=".glb,.gltf">

    <button id="novaUploadModel">Upload Model</button>
    <button id="novaRefreshModels">Refresh Library</button>

    <div id="novaPrivateModels"></div>
  `);

  stylePanel(panel, 650);

  document.body.appendChild(panel);

  updateAccountStatus();
}

async function loadPrivateModels() {
  const container = $("#novaPrivateModels");

  if (!container) return;

  if (!State.session) {
    container.textContent = "Sign in to view your private models.";
    return;
  }

  container.textContent = "Loading models...";

  try {
    const data = await backendRequest("/api/models");

    const models = Array.isArray(data)
      ? data
      : data.models || [];

    container.innerHTML = "";

    if (!models.length) {
      container.textContent = "No models uploaded yet.";
      return;
    }

    models.forEach(model => {
      const card = document.createElement("div");

      card.style.cssText =
        "padding:10px;margin:8px 0;border:1px solid #147e9b;border-radius:8px;";

      const name = document.createElement("strong");

      name.textContent =
        model.name || model.filename || "3D Model";

      const open = document.createElement("button");

      open.textContent = "Open";
      open.dataset.openModel = model.id;

      const remove = document.createElement("button");

      remove.textContent = "Delete";
      remove.dataset.deleteModel = model.id;

      card.append(name, document.createElement("br"), open, remove);

      container.appendChild(card);
    });

  } catch (error) {
    console.error("Model library error:", error);
    container.textContent = error.message;
  }
}

async function uploadPrivateModel() {
  const input = $("#novaModelFile");
  const file = input?.files?.[0];

  if (!file) {
    notify("Choose a model file first.");
    return;
  }

  if (!/\.(glb|gltf)$/i.test(file.name)) {
    notify("Only GLB and GLTF files are supported.");
    return;
  }

  try {
    const formData = new FormData();

    formData.append("model", file);

    await backendRequest("/api/models/upload", {
      method: "POST",
      body: formData
    });

    notify("Model uploaded.");

    input.value = "";

    await loadPrivateModels();

  } catch (error) {
    console.error("Upload error:", error);
    notify(error.message);
  }
}

async function openPrivateModel(id) {
  try {
    const result = await backendRequest(
      "/api/models/" + encodeURIComponent(id) + "/open"
    );

    const url =
      result.signedUrl ||
      result.signed_url ||
      result.url;

    if (!url) {
      throw new Error("No model URL returned.");
    }

    loadModel(url);

  } catch (error) {
    notify(error.message);
  }
}

async function deletePrivateModel(id) {
  if (!confirm("Delete this model from your library?")) return;

  try {
    await backendRequest(
      "/api/models/" + encodeURIComponent(id),
      { method: "DELETE" }
    );

    notify("Model deleted.");

    await loadPrivateModels();

  } catch (error) {
    notify(error.message);
  }
}

/* ============================================================
   20. LAUNCH BUTTONS
============================================================ */

function addLaunchButton(id, label, callback) {
  if ($("#" + id)) return;

  const button = createElement("button", {
    id,
    type: "button"
  }, label);

  button.style.margin = "7px";

  const sidebar = $(".sidebar");

  (sidebar || document.body).appendChild(button);

  button.addEventListener("click", callback);
}

function createLaunchButtons() {
  addLaunchButton(
    "novaAccountLaunch",
    "NOVA Account & 3D Models",
    () => {
      createAccountPanel();
      initializeSupabase();
    }
  );

  addLaunchButton(
    "novaLabLaunch",
    "NOVA Holographic Lab",
    createLabPanel
  );

  addLaunchButton(
    "nova3DLaunch",
    "NOVA 3D Viewer",
    createModelViewer
  );

  addLaunchButton(
    "novaHistoryLaunch",
    "Conversation History",
    createHistoryPanel
  );

  addLaunchButton(
    "novaMemoryLaunch",
    "Memory 2.0",
    createMemoryPanel
  );

  addLaunchButton(
    "novaNotebookLaunch",
    "NOVA Notebook",
    createNotebookPanel
  );

  addLaunchButton(
    "novaAutoSpeak",
    State.autoSpeak ? "Voice: ON" : "Voice: OFF",
    toggleAutoSpeak
  );
}

/* ============================================================
   21. EVENT HANDLING
============================================================ */

function setupEvents() {
  if (window.__NOVA_V19_EVENTS__) return;

  window.__NOVA_V19_EVENTS__ = true;

  document.addEventListener("click", event => {
    const button = event.target.closest?.("button");

    if (!button) return;

    // Chat controls
    if (button.id === "sendBtn") {
      event.preventDefault();
      sendMessage();
      return;
    }

    if (button.id === "voiceBtn") {
      event.preventDefault();
      startVoiceInput();
      return;
    }

    if (button.id === "imageBtn") {
      event.preventDefault();
      $("#imageInput")?.click();
      return;
    }

    if (button.id === "newChat") {
      event.preventDefault();

      if (State.generating) {
        notify("Wait for the current response to finish.");
        return;
      }

      createConversation();

      notify("New conversation started.");
      return;
    }

    // Conversation history
    if (button.dataset.openConversation) {
      openConversation(button.dataset.openConversation);
      return;
    }

    if (button.dataset.deleteConversation) {
      deleteConversation(button.dataset.deleteConversation);
      return;
    }

    if (button.dataset.renameConversation) {
      renameConversation(button.dataset.renameConversation);
      return;
    }

    if (button.id === "novaNewConversation") {
      createConversation();
      return;
    }

    // Memory
    if (button.id === "novaSaveMemory") {
      const input = $("#novaMemoryInput");

      const item = remember(input?.value);

      if (item) {
        input.value = "";
        renderMemoryList();
        notify("Memory saved.");
      }

      return;
    }

    if (button.dataset.deleteMemory) {
      const id = button.dataset.deleteMemory;

      State.memory = State.memory.filter(
        item => item.id !== id
      );

      Store.set("memory", State.memory);

      renderMemoryList();

      notify("Memory removed.");
      return;
    }

    if (button.dataset.toggleMemoryPin) {
      const item = State.memory.find(
        memory => memory.id === button.dataset.toggleMemoryPin
      );

      if (item) {
        item.pinned = !item.pinned;

        Store.set("memory", State.memory);

        renderMemoryList();
      }

      return;
    }

    // Notebook
    if (button.id === "novaNotebookUpload") {
      uploadNotebookDocuments();
      return;
    }

    if (button.id === "novaNotebookAsk") {
      askNotebook();
      return;
    }

    if (button.dataset.removeNotebook) {
      removeNotebookDocument(button.dataset.removeNotebook);
      return;
    }

    if (button.dataset.useNotebook) {
      State.activeNotebookId = button.dataset.useNotebook;

      notify("Notebook document selected.");
      return;
    }

    // Lab and model viewer
    if (button.id === "novaLabGenerate") {
      generateLabConcept();
      return;
    }

    if (button.id === "novaLoadModel") {
      loadModel($("#novaModelUrl")?.value.trim());
      return;
    }

    // Account
    if (button.id === "novaSignUp") {
      signUp(
        $("#novaEmail")?.value.trim(),
        $("#novaPassword")?.value
      );
      return;
    }

    if (button.id === "novaSignIn") {
      signIn(
        $("#novaEmail")?.value.trim(),
        $("#novaPassword")?.value
      );
      return;
    }

    if (button.id === "novaSignOut") {
      signOut();
      return;
    }

    if (button.id === "novaUploadModel") {
      uploadPrivateModel();
      return;
    }

    if (button.id === "novaRefreshModels") {
      loadPrivateModels();
      return;
    }

    if (button.dataset.openModel) {
      openPrivateModel(button.dataset.openModel);
      return;
    }

    if (button.dataset.deleteModel) {
      deletePrivateModel(button.dataset.deleteModel);
      return;
    }

  }, true);

  document.addEventListener("submit", event => {
    if (
      event.target.querySelector("#prompt") ||
      event.target.querySelector("#sendBtn")
    ) {
      event.preventDefault();
      sendMessage();
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (
      event.target?.id === "prompt" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  }, true);

  document.addEventListener("change", event => {
    if (event.target.id === "imageInput") {
      const file = event.target.files?.[0];

      if (file) {
        understandImage(file);
        event.target.value = "";
      }
    }

    if (event.target.id === "novaMemorySearch") {
      renderMemoryList();
    }
  });
}

/* ============================================================
   22. PUBLIC NOVA API
============================================================ */

window.NOVA_API = {
  send: sendMessage,
  initializeAI,

  remember,
  searchMemory,
  forgetMemory,
  pinMemory,
  getMemory: () => State.memory,

  createConversation,
  openConversation,
  deleteConversation,

  createProject,
  deleteProject,

  createTask,
  completeTask,
  deleteTask,

  requestApproval,
  approveAction,
  rejectAction,

  speak,
  stopSpeaking,
  toggleAutoSpeak,
  startVoiceInput,

  understandImage,

  createNotebookPanel,
  uploadNotebookDocuments,
  askNotebook,

  generateLabConcept,
  loadModel,

  createLabPanel,
  createModelViewer,
  createAccountPanel,
  createHistoryPanel,
  createMemoryPanel,
  closePanel,

  getMessages: () => State.messages,
  getConversations: () => State.conversations,
  getProjects: () => State.projects,
  getTasks: () => State.tasks,
  getActivity: () => State.activity,
  getApprovals: () => State.approvals,
  getNotebook: () => State.notebook
};

window.NOVA_V19 = {
  initializeSupabase,
  signUp,
  signIn,
  signOut,

  loadPrivateModels,
  uploadPrivateModel,
  openPrivateModel,
  deletePrivateModel,

  backendRequest
};

// Older version compatibility.
window.NOVA_V18 = window.NOVA_V19;
window.NOVA_V17 = window.NOVA_V19;
window.NOVA_V16 = window.NOVA_V19;

/* ============================================================
   23. STARTUP
============================================================ */

function startNOVA() {
  if (window.__NOVA_V19_STARTED__) return;

  window.__NOVA_V19_STARTED__ = true;

  console.log("NOVA V19 starting...");

  // Restore an existing conversation.
  if (
    State.activeConversationId &&
    State.conversations.some(
      item => item.id === State.activeConversationId
    )
  ) {
    const active = State.conversations.find(
      item => item.id === State.activeConversationId
    );

    State.messages = [...active.messages];

  } else if (State.messages.length) {
    State.activeConversationId = null;
  }

  saveMessages();

  displayStoredMessages();

  setupEvents();
  installPanelCloseSystem();
  createLaunchButtons();

  renderConversationHistory();
  updateVoiceButton();

  initializeSupabase();

  const status = $(".status");

  if (status) {
    status.textContent = "NOVA V19 ready";
  }

  logActivity("NOVA V19 initialized");

  console.log("NOVA V19 initialized successfully.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNOVA, {
    once: true
  });
} else {
  startNOVA();
}

})();

