/* ============================================================
   NOVA V18 — COMPLETE INTEGRATED AI WORKSTATION

   FEATURES
   1. AI Chat — WebLLM
   2. Persistent Chat History
   3. Persistent Memory
   4. Projects and Tasks
   5. Holographic Lab
   6. Image Understanding
   7. Voice Input and Output
   8. 3D Model Viewer
   9. Approval and Activity Management
   10. Supabase Authentication
   11. Private 3D Model Library
   12. Reliable Send Button
   13. Universal Panel Close Buttons
   14. Authenticated Backend Requests
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
  supabaseKey: "sb_publishable_oOlwe8T3nIqeXkhAo1IWuw_T7aEKMWQ",

  backendUrl: "https://nova-3d-backbend.onrender.com",

  storagePrefix: "nova_v18_"
};

/* ============================================================
   2. STORAGE — V17 DATA MIGRATION
============================================================ */

const Store = {
  get(key, fallback = []) {
    try {
      let value = localStorage.getItem(CONFIG.storagePrefix + key);

      // Preserve existing V17 information.
      if (value === null) {
        value = localStorage.getItem("nova_v17_" + key);
      }

      return value ? JSON.parse(value) : fallback;

    } catch (error) {
      console.error("NOVA storage read error:", error);
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(
        CONFIG.storagePrefix + key,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error("NOVA storage write error:", error);
    }
  }
};

const State = {
  messages: Store.get("messages", []),
  memory: Store.get("memory", []),
  projects: Store.get("projects", []),
  tasks: Store.get("tasks", []),
  activity: Store.get("activity", []),
  approvals: Store.get("approvals", []),

  engine: null,
  engineLoading: false,
  generating: false,

  recognition: null,
  supabase: null,
  session: null
};

/* ============================================================
   3. UTILITIES
============================================================ */

const $ = selector => document.querySelector(selector);

function logActivity(message) {
  State.activity.unshift({
    message,
    date: new Date().toISOString()
  });

  State.activity = State.activity.slice(0, 100);
  Store.set("activity", State.activity);
}

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

  let notice = $("#novaNotice");

  if (!notice) {
    notice = createElement("div", {
      id: "novaNotice"
    });

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

/* ============================================================
   4. UNIVERSAL PANEL CLOSE SYSTEM
============================================================ */

const PANEL_IDS = [
  "novaLab",
  "novaModelViewer",
  "novaAccountPanel"
];

function addCloseButton(panel) {
  if (!panel || panel.querySelector(".nova-close-button")) {
    return;
  }

  const close = document.createElement("button");

  close.type = "button";
  close.className = "nova-close-button";
  close.dataset.novaClose = "true";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close panel");
  close.title = "Close panel";

  Object.assign(close.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    width: "38px",
    height: "38px",
    border: "1px solid #20cfff",
    borderRadius: "9px",
    background: "#09283b",
    color: "#65eaff",
    fontSize: "20px",
    fontWeight: "bold",
    cursor: "pointer",
    zIndex: "100000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });

  panel.style.position = "fixed";
  panel.appendChild(close);

  // Keep the panel heading clear of the close button.
  const heading = panel.querySelector("h2");

  if (heading) {
    heading.style.paddingRight = "45px";
  }
}

function closePanel(panel) {
  if (!panel) return;

  panel.remove();
  logActivity("Panel closed: " + panel.id);
}

function installPanelCloseSystem() {
  PANEL_IDS.forEach(id => {
    const panel = document.getElementById(id);
    if (panel) addCloseButton(panel);
  });

  if (window.__NOVA_V18_CLOSE_SYSTEM__) return;

  window.__NOVA_V18_CLOSE_SYSTEM__ = true;

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-nova-close]");

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    closePanel(button.closest("section"));
  }, true);

  const observer = new MutationObserver(() => {
    PANEL_IDS.forEach(id => {
      const panel = document.getElementById(id);

      if (panel) addCloseButton(panel);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/* ============================================================
   5. CHAT DISPLAY
============================================================ */

function getChatElement() {
  return document.getElementById("chat");
}

function renderMessage(message) {
  const chat = getChatElement();

  if (!chat) {
    console.error("NOVA: Cannot find #chat.");
    return;
  }

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

  content.textContent = message.content;
  content.style.marginTop = "6px";

  wrapper.append(label, content);
  chat.appendChild(wrapper);

  chat.scrollTop = chat.scrollHeight;
}

function displayStoredMessages() {
  const chat = getChatElement();

  if (!chat) return;

  chat.innerHTML = "";

  State.messages.forEach(renderMessage);
}

function addMessage(role, content) {
  const message = {
    role,
    content: String(content),
    timestamp: new Date().toISOString()
  };

  State.messages.push(message);
  Store.set("messages", State.messages);

  renderMessage(message);

  return message;
}

/* ============================================================
   6. WEBLLM ENGINE
============================================================ */

async function initializeAI() {
  if (State.engine) return State.engine;

  if (State.engineLoading) {
    notify("NOVA is already initializing.");
    return null;
  }

  State.engineLoading = true;

  notify("Initializing NOVA AI. This may take a moment.");

  try {
    const webllm = await import(
      "https://esm.run/@mlc-ai/web-llm"
    );

    const models = [
      CONFIG.model,
      CONFIG.fallbackModel
    ];

    let lastError;

    for (const model of models) {
      try {
        State.engine = await webllm.CreateMLCEngine(model, {
          initProgressCallback(progress) {
            const status = $(".status");

            if (status) {
              status.textContent =
                progress.text || "Loading NOVA AI...";
            }

            console.log("NOVA loading:", progress);
          }
        });

        logActivity("AI engine initialized: " + model);
        notify("NOVA AI is ready.");

        return State.engine;

      } catch (error) {
        lastError = error;
        console.warn("Model failed:", model, error);
      }
    }

    throw lastError || new Error("No AI model could be loaded.");

  } catch (error) {
    console.error("NOVA AI initialization failed:", error);

    notify(
      "AI initialization failed. Check your connection and browser support."
    );

    return null;

  } finally {
    State.engineLoading = false;
  }
}

/* ============================================================
   7. MEMORY SYSTEM
============================================================ */

function remember(text) {
  State.memory.push({
    content: text,
    date: new Date().toISOString()
  });

  Store.set("memory", State.memory);
  logActivity("Memory saved");

  notify("Memory saved.");
}

function getMemoryContext() {
  if (!State.memory.length) return "";

  return "\n\nNOVA MEMORY:\n" +
    State.memory
      .slice(-30)
      .map(item => "- " + item.content)
      .join("\n");
}

function processMemoryCommand(text) {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith("remember that ")) {
    remember(text.substring(14).trim());

    addMessage(
      "assistant",
      "I'll save that in NOVA's local memory."
    );

    return true;
  }

  if (lower === "show memory") {
    const result = State.memory.length
      ? State.memory.map((item, index) =>
          `${index + 1}. ${item.content}`
        ).join("\n")
      : "NOVA has no saved memories.";

    addMessage("assistant", result);
    return true;
  }

  if (lower === "clear memory") {
    State.memory = [];
    Store.set("memory", State.memory);

    addMessage("assistant", "Local memory cleared.");

    return true;
  }

  return false;
}


/* ============================================================
   8. SEND MESSAGE — NOVA AI 2.0
   Online OpenAI + Offline WebLLM fallback
============================================================ */

async function sendMessage() {
  if (State.generating) return;

  const promptInput = document.getElementById("prompt");

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

  const sendButton = document.getElementById("sendBtn");
  const originalText = sendButton?.textContent || "Send";

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

    const memoryContext = getMemoryContext();

    let answer = "";
    let onlineSuccess = false;

    // PRIMARY ENGINE: ONLINE AI
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
            memoryContext
          })
        });

        if (!result?.answer) {
          throw new Error("Online AI returned an empty response.");
        }

        answer = result.answer;
        onlineSuccess = true;

        logActivity("Online AI response generated.");

      } catch (error) {
        console.warn("Online AI unavailable:", error);
        notify("Online AI unavailable. Switching to offline mode.");
      }
    }

    // FALLBACK ENGINE: LOCAL WEBLLM
    if (!onlineSuccess) {
      const engine = await initializeAI();

      if (!engine) {
        throw new Error(
          "Neither online nor offline AI is currently available. Check your connection and sign-in status."
        );
      }

      const systemPrompt = {
        role: "system",
        content:
          "You are NOVA, a helpful personal AI assistant. " +
          "Answer clearly and accurately. " +
          "Help with learning, reasoning, programming, writing and projects. " +
          "Use saved memories only when relevant. " +
          "Do not claim to perform actions you have not performed.\n\n" +
          memoryContext
      };

      const response = await engine.chat.completions.create({
        messages: [systemPrompt, ...history],
        temperature: 0.7,
        max_tokens: 700
      });

      answer =
        response.choices?.[0]?.message?.content ||
        "I couldn't generate a response.";

      logActivity("Offline AI response generated.");
    }

    addMessage("assistant", answer);

  } catch (error) {
    console.error("NOVA AI error:", error);

    addMessage(
      "assistant",
      "NOVA encountered an error: " + error.message
    );

  } finally {
    State.generating = false;

    const currentButton = document.getElementById("sendBtn");

    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = originalText;
    }

    document.getElementById("prompt")?.focus();
  }
}


/* ============================================================
   9. PROJECT MANAGEMENT
============================================================ */

function createProject(name, description = "") {
  const project = {
    id: crypto.randomUUID(),
    name,
    description,
    created: new Date().toISOString()
  };

  State.projects.push(project);
  Store.set("projects", State.projects);

  logActivity("Project created: " + name);
  notify("Project created.");

  return project;
}

function deleteProject(id) {
  State.projects = State.projects.filter(
    project => project.id !== id
  );

  Store.set("projects", State.projects);
  notify("Project deleted.");
}

/* ============================================================
   10. TASK MANAGEMENT
============================================================ */

function createTask(title, description = "") {
  const task = {
    id: crypto.randomUUID(),
    title,
    description,
    completed: false,
    created: new Date().toISOString()
  };

  State.tasks.push(task);
  Store.set("tasks", State.tasks);

  logActivity("Task created: " + title);
  notify("Task created.");

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
    task => task.id !== id
  );

  Store.set("tasks", State.tasks);
}

/* ============================================================
   11. APPROVAL SYSTEM
============================================================ */

function requestApproval(action, details = "") {
  const approval = {
    id: crypto.randomUUID(),
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
   12. VOICE INPUT
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
    const transcript =
      event.results[0][0].transcript;

    const prompt = document.getElementById("prompt");

    if (prompt) {
      prompt.value = transcript;
      prompt.focus();
    }
  };

  recognition.onerror = error => {
    console.error("Voice error:", error);
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

/* ============================================================
   13. VOICE OUTPUT
============================================================ */

function speak(text) {
  if (!("speechSynthesis" in window)) {
    notify("Speech output is not supported.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
}

/* ============================================================
   14. IMAGE UNDERSTANDING
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

    logActivity("Image analyzed");

  } catch (error) {
    console.error("Image analysis error:", error);
    notify("Image analysis failed.");

  } finally {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
  }
}

/* ============================================================
   15. HOLOGRAPHIC LAB
============================================================ */

function createLabPanel() {
  if ($("#novaLab")) {
    addCloseButton($("#novaLab"));
    return;
  }

  const panel = createElement("section", {
    id: "novaLab"
  }, `
    <h2>NOVA HOLOGRAPHIC LAB</h2>
    <p>Generate and manage visual project concepts.</p>

    <textarea id="novaLabPrompt"
      placeholder="Describe your visual concept..."
      style="width:100%;min-height:90px;box-sizing:border-box;"></textarea>

    <button id="novaLabGenerate">Generate Concept</button>

    <div id="novaLabResult"></div>
  `);

  Object.assign(panel.style, {
    position: "fixed",
    top: "10%",
    left: "5%",
    width: "90%",
    maxWidth: "650px",
    maxHeight: "80vh",
    overflowY: "auto",
    zIndex: "99990",
    padding: "20px",
    boxSizing: "border-box",
    background: "#061421",
    color: "#65eaff",
    border: "1px solid #12c8ef",
    borderRadius: "14px"
  });

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

  if (result) {
    result.textContent = "Connecting to NOVA backend...";
  }

  try {
    // Uses the authenticated backend request.
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
      result.textContent =
        data.text || JSON.stringify(data);
    }

  } catch (error) {
    console.error("Lab error:", error);

    if (result) {
      result.textContent =
        "Generation service response: " + error.message;
    }
  }
}

/* ============================================================
   16. 3D MODEL VIEWER
============================================================ */

function createModelViewer() {
  if ($("#novaModelViewer")) {
    addCloseButton($("#novaModelViewer"));
    return;
  }

  const panel = createElement("section", {
    id: "novaModelViewer"
  }, `
    <h2>NOVA 3D VIEWER</h2>

    <input id="novaModelUrl"
      placeholder="Paste a GLB or GLTF model URL"
      style="width:100%;box-sizing:border-box;">

    <button id="novaLoadModel">Load Model</button>

    <model-viewer id="novaModel"
      camera-controls
      auto-rotate
      shadow-intensity="1"
      style="width:100%;height:350px;background:#081725;">
    </model-viewer>
  `);

  Object.assign(panel.style, {
    position: "fixed",
    top: "8%",
    left: "5%",
    width: "90%",
    maxWidth: "700px",
    maxHeight: "84vh",
    overflowY: "auto",
    zIndex: "99990",
    padding: "18px",
    boxSizing: "border-box",
    background: "#061421",
    color: "#65eaff",
    border: "1px solid #12c8ef",
    borderRadius: "14px"
  });

  document.body.appendChild(panel);
  addCloseButton(panel);

  if (!document.getElementById("novaModelViewerScript")) {
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
   17. SUPABASE AUTHENTICATION
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
    console.error("Supabase initialization error:", error);
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

  const { data, error } =
    await client.auth.signUp({ email, password });

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

  const models = $("#novaPrivateModels");

  if (models) {
    models.textContent = "Sign in to view your private models.";
  }

  notify("Signed out.");
}

/* ============================================================
   18. ACCOUNT AND MODEL PANEL
============================================================ */

function createAccountPanel() {
  if ($("#novaAccountPanel")) {
    addCloseButton($("#novaAccountPanel"));
    return;
  }

  const panel = createElement("section", {
    id: "novaAccountPanel"
  }, `
    <h2>NOVA V18 — ACCOUNT & MODEL LIBRARY</h2>

    <p id="novaAccountStatus">Checking account...</p>

    <input id="novaEmail"
      type="email"
      placeholder="Email address"
      style="width:100%;margin:5px 0;box-sizing:border-box;">

    <input id="novaPassword"
      type="password"
      placeholder="Password"
      style="width:100%;margin:5px 0;box-sizing:border-box;">

    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="novaSignUp">Create Account</button>
      <button id="novaSignIn">Sign In</button>
      <button id="novaSignOut">Sign Out</button>
    </div>

    <hr>

    <h3>Private 3D Model Library</h3>

    <input id="novaModelFile"
      type="file"
      accept=".glb,.gltf">

    <button id="novaUploadModel">Upload Model</button>
    <button id="novaRefreshModels">Refresh Library</button>

    <div id="novaPrivateModels"></div>
  `);

  Object.assign(panel.style, {
    position: "fixed",
    top: "5%",
    left: "5%",
    width: "90%",
    maxWidth: "650px",
    maxHeight: "90vh",
    overflowY: "auto",
    zIndex: "99990",
    padding: "18px",
    boxSizing: "border-box",
    background: "#061421",
    color: "#65eaff",
    border: "1px solid #12c8ef",
    borderRadius: "14px"
  });

  document.body.appendChild(panel);
  addCloseButton(panel);

  updateAccountStatus();
}

/* ============================================================
   19. AUTHENTICATED BACKEND REQUESTS
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
   20. PRIVATE MODEL LIBRARY
============================================================ */

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
      const card = createElement("div", {}, `
        <strong>${escapeHTML(model.name || model.filename || "3D Model")}</strong>
        <br>
        <button data-open-model="${escapeHTML(model.id)}">Open</button>
        <button data-delete-model="${escapeHTML(model.id)}">Delete</button>
      `);

      Object.assign(card.style, {
        padding: "10px",
        margin: "8px 0",
        border: "1px solid #147e9b",
        borderRadius: "8px"
      });

      container.appendChild(card);
    });

  } catch (error) {
    console.error("Model library error:", error);
    container.textContent = error.message;
  }
}

async function uploadPrivateModel() {
  const fileInput = $("#novaModelFile");
  const file = fileInput?.files?.[0];

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

    fileInput.value = "";

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
      throw new Error("Backend did not return a model URL.");
    }

    loadModel(url);

  } catch (error) {
    console.error("Open model error:", error);
    notify(error.message);
  }
}

async function deletePrivateModel(id) {
  if (!confirm("Delete this model from your private library?")) {
    return;
  }

  try {
    await backendRequest(
      "/api/models/" + encodeURIComponent(id),
      { method: "DELETE" }
    );

    notify("Model deleted.");

    await loadPrivateModels();

  } catch (error) {
    console.error("Delete model error:", error);
    notify(error.message);
  }
}

/* ============================================================
   21. EVENT HANDLING — SEND BUTTON PROTECTION
============================================================ */

function setupEvents() {

  /*
   * Install the main delegated handlers once.
   * They continue working if buttons are recreated.
   */

  if (!window.__NOVA_V18_EVENTS_INSTALLED__) {
    window.__NOVA_V18_EVENTS_INSTALLED__ = true;

    // SEND BUTTON
    document.addEventListener("click", event => {
      const button = event.target.closest?.("#sendBtn");

      if (!button) return;

      event.preventDefault();

      sendMessage();
    }, true);

    // FORM SUBMISSION
    document.addEventListener("submit", event => {
      const form = event.target;

      if (
        form.querySelector("#prompt") ||
        form.querySelector("#sendBtn")
      ) {
        event.preventDefault();
        sendMessage();
      }
    }, true);

    // ENTER TO SEND
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

    // ALL OTHER BUTTONS
    document.addEventListener("click", event => {
      const target = event.target.closest?.("button");

      if (!target) return;

      switch (target.id) {

        case "voiceBtn":
          event.preventDefault();
          startVoiceInput();
          break;

        case "imageBtn":
          event.preventDefault();
          $("#imageInput")?.click();
          break;

        case "newChat":
          event.preventDefault();

          if (State.generating) {
            notify("Wait for the current response to finish.");
            break;
          }

          State.messages = [];
          Store.set("messages", []);
          displayStoredMessages();

          notify("New conversation started.");
          break;

        case "novaLabGenerate":
          event.preventDefault();
          generateLabConcept();
          break;

        case "novaLoadModel":
          event.preventDefault();
          loadModel($("#novaModelUrl")?.value.trim());
          break;

        case "novaSignUp":
          event.preventDefault();

          signUp(
            $("#novaEmail")?.value.trim(),
            $("#novaPassword")?.value
          );
          break;

        case "novaSignIn":
          event.preventDefault();

          signIn(
            $("#novaEmail")?.value.trim(),
            $("#novaPassword")?.value
          );
          break;

        case "novaSignOut":
          event.preventDefault();
          signOut();
          break;

        case "novaUploadModel":
          event.preventDefault();
          uploadPrivateModel();
          break;

        case "novaRefreshModels":
          event.preventDefault();
          loadPrivateModels();
          break;

        case "novaV16Launch":
          event.preventDefault();
          createAccountPanel();
          initializeSupabase();
          break;

        case "novaLabLaunch":
          event.preventDefault();
          createLabPanel();
          break;

        case "nova3DLaunch":
          event.preventDefault();
          createModelViewer();
          break;

        default:
          break;
      }

      const openButton = target.closest("[data-open-model]");

      if (openButton) {
        event.preventDefault();
        openPrivateModel(openButton.dataset.openModel);
      }

      const deleteButton = target.closest("[data-delete-model]");

      if (deleteButton) {
        event.preventDefault();
        deletePrivateModel(deleteButton.dataset.deleteModel);
      }

    }, true);

    // IMAGE INPUT
    document.addEventListener("change", event => {
      if (event.target.id === "imageInput") {
        const file = event.target.files?.[0];

        if (file) {
          understandImage(file);
        }
      }
    });
  }

  /*
   * Create launch buttons.
   */

  const sidebar = $(".sidebar");

  if (!$("#novaV16Launch")) {
    const launch = createElement("button", {
      id: "novaV16Launch",
      type: "button"
    }, "NOVA V18 • Account & 3D Models");

    launch.style.margin = "8px";

    (sidebar || document.body).appendChild(launch);
  }

  if (!$("#novaLabLaunch")) {
    const button = createElement("button", {
      id: "novaLabLaunch",
      type: "button"
    }, "NOVA Holographic Lab");

    button.style.margin = "8px";

    (sidebar || document.body).appendChild(button);
  }

  if (!$("#nova3DLaunch")) {
    const button = createElement("button", {
      id: "nova3DLaunch",
      type: "button"
    }, "NOVA 3D Viewer");

    button.style.margin = "8px";

    (sidebar || document.body).appendChild(button);
  }
}

/* ============================================================
   22. PUBLIC NOVA API
============================================================ */

window.NOVA_API = {
  send: sendMessage,
  initializeAI,

  remember,
  getMemory: () => State.memory,

  createProject,
  deleteProject,

  createTask,
  completeTask,
  deleteTask,

  requestApproval,
  approveAction,
  rejectAction,

  speak,
  startVoiceInput,

  understandImage,
  generateLabConcept,
  loadModel,

  createLabPanel,
  createModelViewer,
  createAccountPanel,
  closePanel,

  getMessages: () => State.messages,
  getProjects: () => State.projects,
  getTasks: () => State.tasks,
  getActivity: () => State.activity,
  getApprovals: () => State.approvals
};

window.NOVA_V18 = {
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

// Compatibility with older V16/V17 calls.
window.NOVA_V16 = window.NOVA_V18;
window.NOVA_V17 = window.NOVA_V18;

/* ============================================================
   23. STARTUP
============================================================ */

function startNOVA() {
  console.log("NOVA V18 starting...");

  displayStoredMessages();

  setupEvents();
  installPanelCloseSystem();

  initializeSupabase();

  const status = $(".status");

  if (status) {
    status.textContent = "NOVA V18 ready";
  }

  logActivity("NOVA V18 initialized");

  console.log("NOVA V18 initialized successfully.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNOVA, {
    once: true
  });
} else {
/* ============================================================
   NOVA MEMORY 2.0
   Enhanced persistent memory engine
   Compatible with NOVA V18 and V17 storage
============================================================ */

remember = function(text, category = "general") {
  if (!text || !String(text).trim()) return null;

  const content = String(text).trim();

  if (!Array.isArray(State.memory)) {
    State.memory = [];
  }

  // Normalize older memories
  State.memory = State.memory.map(item =>
    typeof item === "string"
      ? { content: item, date: new Date().toISOString(), category: "general", pinned: false }
      : item
  );

  // Prevent duplicates
  const duplicate = State.memory.find(item =>
    item.content.toLowerCase() === content.toLowerCase()
  );

  if (duplicate) {
    duplicate.date = new Date().toISOString();
    Store.set("memory", State.memory);
    return duplicate;
  }

  const memory = {
    id: "mem_" + Date.now(),
    content,
    category,
    date: new Date().toISOString(),
    pinned: false
  };

  State.memory.push(memory);

  Store.set("memory", State.memory);

  return memory;
};


/* SEARCH MEMORY */

searchMemory = function(query) {
  const term = String(query || "").toLowerCase().trim();

  if (!term) return State.memory;

  return State.memory.filter(memory =>
    memory.content.toLowerCase().includes(term) ||
    (memory.category || "").toLowerCase().includes(term)
  );
};


/* FORGET INDIVIDUAL MEMORY */

forgetMemory = function(query) {
  const term = String(query || "").toLowerCase().trim();

  if (!term) return 0;

  const before = State.memory.length;

  State.memory = State.memory.filter(memory =>
    !memory.content.toLowerCase().includes(term)
  );

  Store.set("memory", State.memory);

  return before - State.memory.length;
};


/* PIN IMPORTANT MEMORIES */

pinMemory = function(query, pinned = true) {
  const term = String(query || "").toLowerCase().trim();

  const memory = State.memory.find(item =>
    item.content.toLowerCase().includes(term)
  );

  if (!memory) return false;

  memory.pinned = pinned;

  Store.set("memory", State.memory);

  return true;
};


/* BUILD AI MEMORY CONTEXT */

getMemoryContext = function() {
  if (!State.memory.length) return "";

  const memories = [...State.memory].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return new Date(b.date) - new Date(a.date);
  });

  const selected = memories.slice(0, 40);

  return `
NOVA LONG-TERM MEMORY

Use these saved facts when relevant.
Do not assume outdated information is still correct.

${selected.map(item =>
  `[${item.category || "general"}] ${item.content}`
).join("\n")}

END OF MEMORY
`;
};


/* MEMORY RESPONSE DISPLAY */

function novaMemoryReply(message) {
  const chat = document.getElementById("chat");

  if (!chat) return;

  const bubble = document.createElement("div");
  bubble.className = "message bot";

  const heading = document.createElement("strong");
  heading.textContent = "NOVA";

  const paragraph = document.createElement("p");
  paragraph.textContent = message;

  bubble.appendChild(heading);
  bubble.appendChild(paragraph);

  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}


/* MEMORY COMMAND PROCESSOR */

processMemoryCommand = function(input) {
  const text = String(input || "").trim();

  let match;

  // SAVE MEMORY
  match = text.match(/^remember(?: that)?\s+(.+)/i);

  if (match) {
    const memory = remember(match[1]);

    novaMemoryReply(
      memory
        ? "Memory saved successfully."
        : "I could not save that memory."
    );

    return true;
  }

  // SHOW ALL MEMORIES
  if (/^(show|list|view) memories$|^show memory$/i.test(text)) {
    if (!State.memory.length) {
      novaMemoryReply("My memory is currently empty.");
    } else {
      const list = State.memory.map((item, index) =>
        `${index + 1}. ${item.pinned ? "📌 " : ""}${item.content}`
      ).join("\n");

      novaMemoryReply("Here is what I remember:\n" + list);
    }

    return true;
  }

  // SEARCH MEMORY
  match = text.match(/^(?:search|find) memory(?: for)?\s+(.+)/i);

  if (match) {
    const results = searchMemory(match[1]);

    novaMemoryReply(
      results.length
        ? "I found:\n" + results.map(item => item.content).join("\n")
        : "I couldn't find a matching memory."
    );

    return true;
  }

  // FORGET A SPECIFIC MEMORY
  match = text.match(/^forget memory(?: about)?\s+(.+)/i);

  if (match) {
    const removed = forgetMemory(match[1]);

    novaMemoryReply(
      removed
        ? `Removed ${removed} matching memory item(s).`
        : "I couldn't find that memory."
    );

    return true;
  }

  // PIN MEMORY
  match = text.match(/^pin memory\s+(.+)/i);

  if (match) {
    const success = pinMemory(match[1]);

    novaMemoryReply(
      success
        ? "Memory pinned successfully."
        : "I couldn't find that memory."
    );

    return true;
  }

  // CLEAR ALL MEMORY
  if (/^clear memory$/i.test(text)) {
    State.memory = [];

    Store.set("memory", State.memory);

    novaMemoryReply("All saved memories have been cleared.");

    return true;
  }

  return false;
};


/* UPDATE PUBLIC NOVA API */

window.NOVA_API = window.NOVA_API || {};

Object.assign(window.NOVA_API, {
  remember,
  getMemory: () => State.memory,
  searchMemory,
  forgetMemory,
  pinMemory
});

console.log("NOVA Memory 2.0 initialized.");

  startNOVA();
}

})();
