/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const productSearch = document.getElementById("productSearch");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* --- New: selection state and UI container --- */
// track selected products (store full product objects)
const selectedProducts = [];

// use the existing Selected Products list container (fall back to creating it inside .selected-products)
let selectedListContainer = document.getElementById("selectedProductsList");
if (!selectedListContainer) {
  const wrapper = document.querySelector(".selected-products") || document.body;
  selectedListContainer = document.createElement("div");
  selectedListContainer.id = "selectedProductsList";
  wrapper.appendChild(selectedListContainer);
}

// inject minimal styles for selected state and list (beginner-friendly)
const style = document.createElement("style");
style.textContent = `
  .product-card.selected { border: 3px solid #2b8fef; box-shadow: 0 4px 10px rgba(43,143,239,0.15); }
  /* small tile inside the Selected Products area */
  .selected-tile { display:flex; align-items:center; gap:8px; background:#fff; padding:8px 10px; border-radius:6px; border:1px solid #eee; }
  .selected-tile img { width:40px; height:40px; object-fit:cover; border-radius:4px; }
  .selected-tile .meta { font-size:13px; color:#333; }
  .selected-tile .brand { font-size:12px; color:#666; }
  .remove-btn { background:#ff6b6b; color:white; border:none; padding:6px 8px; border-radius:4px; cursor:pointer; }
`;
document.head.appendChild(style);

// Worker endpoint used to proxy OpenAI requests (no local API key required)
const WORKER_URL = "https://loral-chatbot.n0hama01.workers.dev/";

/* --- New: localStorage helpers to persist selected products --- */
function saveSelectedToStorage() {
  try {
    localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
  } catch (err) {
    // ignore storage errors in simple demo
    console.warn("Could not save selected products", err);
  }
}

function loadSelectedFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // clear and restore into the existing array so references stay consistent
      selectedProducts.length = 0;
      parsed.forEach((p) => {
        // ensure legacy items have a stable _key
        if (!p._key) p._key = p.id ? String(p.id) : p.name;
        selectedProducts.push(p);
      });
      // ensure the Selected Products UI shows restored items immediately
      updateSelectedProductsUI();
    }
  } catch (err) {
    console.warn("Could not load selected products", err);
  }
}

// load persisted selections on startup
loadSelectedFromStorage();

/* --- New: update selected products UI --- */
function updateSelectedProductsUI() {
  // render each selected product as a small tile inside the existing #selectedProductsList
  selectedListContainer.innerHTML = selectedProducts
    .map(
      (p) => `
    <div class="selected-tile" data-key="${p._key}">
      <img src="${p.image}" alt="${p.name}">
      <div class="meta">
        <div>${p.name}</div>
        <div class="brand">${p.brand || ""}</div>
      </div>
      <button class="remove-btn" data-key="${p._key}">Remove</button>
    </div>
  `
    )
    .join("");

  // attach remove handlers to buttons
  const removeButtons = selectedListContainer.querySelectorAll(".remove-btn");
  removeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.currentTarget.getAttribute("data-key");
      // remove from selectedProducts
      const idx = selectedProducts.findIndex((x) => x._key === key);
      if (idx > -1) {
        selectedProducts.splice(idx, 1);
        // visually deselect the card if present
        const card = productsContainer.querySelector(
          `.product-card[data-key="${key}"]`
        );
        if (card) card.classList.remove("selected");
        updateSelectedProductsUI();
        saveSelectedToStorage(); // persist removal
      }
    });
  });
}

/* helper to escape HTML in product descriptions (prevents accidental HTML injection) */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* helper: format a short timestamp */
function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* render the full conversation into the chatWindow as chat bubbles */
function renderChatWindow() {
  if (!conversationMessages || conversationMessages.length === 0) {
    chatWindow.innerHTML = "";
    return;
  }

  // only render messages not explicitly hidden (show !== false)
  const visible = conversationMessages.filter((m) => m.show !== false);

  chatWindow.innerHTML = visible
    .map((m) => {
      const time = formatTime(new Date());
      if (m.role === "assistant") {
        return `
          <div class="message message-assistant">
            <div class="avatar" aria-hidden="true">A</div>
            <div class="bubble">
              <pre>${escapeHtml(m.content)}</pre>
              <div class="meta">${escapeHtml(time)}</div>
            </div>
          </div>
        `;
      }
      if (m.role === "user") {
        return `
          <div class="message message-user">
            <div class="bubble">
              <div>${escapeHtml(m.content)}</div>
              <div class="meta">${escapeHtml(time)}</div>
            </div>
          </div>
        `;
      }
      return "";
    })
    .join("");

  // make newly rendered messages animate in
  requestAnimationFrame(() => {
    const msgs = chatWindow.querySelectorAll(".message");
    msgs.forEach((el) => el.classList.add("visible"));
    // scroll to bottom smoothly
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
  });
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  // ensure each product has a stable internal key (use id or name)
  const normalize = (p) => {
    const key = p.id ? String(p.id) : p.name;
    return { ...p, _key: key };
  };
  const normalized = products.map(normalize);

  productsContainer.innerHTML = normalized
    .map(
      (product) => `
    <div class="product-card" data-key="${
      product._key
    }" tabindex="0" aria-describedby="desc-${product._key}">
      <img src="${product.image}" alt="${escapeHtml(product.name)}">
      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.brand || "")}</p>
        <button class="details-btn" aria-expanded="false" aria-controls="desc-${
          product._key
        }">Details</button>
      </div>

      <!-- full-card description overlay (covers whole card via CSS) -->
      <div id="desc-${product._key}" class="product-desc" aria-hidden="true">
        ${escapeHtml(product.description || "")}
      </div>
    </div>
  `
    )
    .join("");

  // mark already selected items visually
  normalized.forEach((product) => {
    if (selectedProducts.find((p) => p._key === product._key)) {
      const card = productsContainer.querySelector(
        `.product-card[data-key="${product._key}"]`
      );
      if (card) card.classList.add("selected");
    }
  });

  // attach click handlers to toggle selection
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    card.addEventListener("click", (e) => {
      // If the click came from the details button, ignore — that has its own handler
      if (e.target.closest && e.target.closest(".details-btn")) return;
      const key = card.getAttribute("data-key");
      // find product data from normalized list
      const product = normalized.find((p) => p._key === key);
      if (!product) return;

      const existingIndex = selectedProducts.findIndex((p) => p._key === key);
      if (existingIndex === -1) {
        // add to selection
        selectedProducts.push(product);
        card.classList.add("selected");
      } else {
        // remove from selection
        selectedProducts.splice(existingIndex, 1);
        card.classList.remove("selected");
      }
      updateSelectedProductsUI();
      saveSelectedToStorage(); // persist selection change
    });

    // allow keyboard users to toggle selection with Enter/Space
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });

    // keep aria-hidden in sync for the overlay when focused (helps screen reader users)
    card.addEventListener("focusin", () => {
      const desc = card.querySelector(".product-desc");
      if (desc) desc.setAttribute("aria-hidden", "false");
    });
    card.addEventListener("focusout", () => {
      const desc = card.querySelector(".product-desc");
      if (desc) desc.setAttribute("aria-hidden", "true");
    });

    // hook up the details button to toggle the overlay on touch/small screens
    const detailsBtn = card.querySelector(".details-btn");
    if (detailsBtn) {
      detailsBtn.addEventListener("click", (ev) => {
        ev.stopPropagation(); // don't toggle selection
        const desc = card.querySelector(".product-desc");
        const isOpen = card.classList.toggle("open");
        detailsBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (desc) desc.setAttribute("aria-hidden", isOpen ? "false" : "true");
      });
    }
  });

  // refresh the Selected Products UI after rendering
  updateSelectedProductsUI();
}

/* --- New: search handling --- */
let currentProducts = []; // products for the current category (or all when searching globally)

// apply search on currentProducts and display results
async function applySearchAndDisplay() {
  // if there are no currentProducts (no category selected yet), load all products so search can work
  if (!currentProducts || currentProducts.length === 0) {
    try {
      currentProducts = await loadProducts();
    } catch (err) {
      // fallback: show nothing
      displayProducts([]);
      return;
    }
  }

  const q =
    (productSearch &&
      productSearch.value &&
      productSearch.value.trim().toLowerCase()) ||
    "";
  if (!q) {
    displayProducts(currentProducts);
    return;
  }

  const filtered = currentProducts.filter((p) => {
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  displayProducts(filtered);
}

// wire search input to live-filter as user types
if (productSearch) {
  productSearch.addEventListener("input", () => {
    applySearchAndDisplay();
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  // keep the "currentProducts" in sync with the chosen category and apply search over it
  currentProducts = filteredProducts;
  applySearchAndDisplay();
});

/* --- New: persistent conversation history for chat (used with OpenAI) --- */
const conversationMessages = [
  {
    role: "system",
    content:
      // Be explicit: assistant must only answer routine-related or topical questions and refuse others.
      // Also instruct it to perform live web searches when up-to-date information, links, or citations are needed.
      "You are a helpful skincare and beauty routine assistant. Only answer questions that relate to the generated routine or to topics like skincare, haircare, makeup, fragrance, suncare, products, and routines. If a user asks about unrelated topics, politely refuse and state you can only help with routine/product related questions. Keep answers concise and friendly. Use the conversation history to provide context-aware follow-ups. When a question requires current information (product launches, current availability, recent news, or up-to-date guidance), perform a live web search and include concise citations or links in your reply so the user can verify sources.",
    // system messages are hidden from the UI by default
    show: false,
  },
];

// render the full conversation into the chatWindow (simple, beginner-friendly)
function renderChatWindow() {
  if (!conversationMessages || conversationMessages.length === 0) {
    chatWindow.innerHTML = "";
    return;
  }

  // only render messages not explicitly hidden (show !== false)
  const visible = conversationMessages.filter((m) => m.show !== false);

  chatWindow.innerHTML = visible
    .map((m) => {
      const time = formatTime(new Date());
      if (m.role === "assistant") {
        return `
          <div class="message message-assistant">
            <div class="avatar" aria-hidden="true">A</div>
            <div class="bubble">
              <pre>${escapeHtml(m.content)}</pre>
              <div class="meta">${escapeHtml(time)}</div>
            </div>
          </div>
        `;
      }
      if (m.role === "user") {
        return `
          <div class="message message-user">
            <div class="bubble">
              <div>${escapeHtml(m.content)}</div>
              <div class="meta">${escapeHtml(time)}</div>
            </div>
          </div>
        `;
      }
      return "";
    })
    .join("");

  // make newly rendered messages animate in
  requestAnimationFrame(() => {
    const msgs = chatWindow.querySelectorAll(".message");
    msgs.forEach((el) => el.classList.add("visible"));
    // scroll to bottom smoothly
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
  });
}

/* --- Update: Generate Routine button handler (append to conversation history) --- */
const generateBtn = document.getElementById("generateRoutine");
if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    if (!selectedProducts || selectedProducts.length === 0) {
      chatWindow.innerHTML =
        "<div>Please select one or more products first.</div>";
      return;
    }

    const payloadProducts = selectedProducts.map((p) => ({
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
    }));

    // Add the user's request to the conversation history but mark it hidden so the long JSON is NOT shown in the chat UI
    const userMessage = {
      role: "user",
      content: `Please generate a personalized routine using only these products (JSON): ${JSON.stringify(
        payloadProducts,
        null,
        2
      )}`,
      show: false, // <-- keep it in history but do not render to chatWindow
    };
    conversationMessages.push(userMessage);

    // Show loading in UI while we wait and also render current visible history
    renderChatWindow();
    chatWindow.innerHTML += "<div>Generating routine…</div>";

    try {
      // Send only role+content to the worker (strip internal show flags)
      const apiMessages = conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Request the worker to enable web search tools for up-to-date info and citations.
      // The worker should forward this to the Responses API with the web-search tool enabled.
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: apiMessages,
          max_tokens: 800,
          temperature: 0.7,
          // hint to the worker: enable web search/tooling (worker implements actual forwarding)
          tools: ["web_search"],
          // optional: ask the worker to include links/citations inline in the assistant message
          include_citations: true,
          max_search_results: 5,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        chatWindow.innerHTML = `<div>Error from OpenAI: ${res.status} ${
          res.statusText
        }<pre style="white-space:pre-wrap">${escapeHtml(errText)}</pre></div>`;
        return;
      }

      const data = await res.json();
      const aiMessage =
        data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;

      if (aiMessage) {
        // append assistant reply to conversation history and render
        conversationMessages.push({ role: "assistant", content: aiMessage });
        renderChatWindow();
      } else {
        chatWindow.innerHTML =
          "<div>Could not find a valid response from the AI.</div>";
      }
    } catch (err) {
      chatWindow.innerHTML = `<div>Request failed: ${escapeHtml(
        err.message
      )}</div>`;
    }
  });
}

/* --- New: Clear selections handler --- */
const clearBtn = document.getElementById("clearSelections");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    // empty selection array
    selectedProducts.length = 0;
    // remove visual selection from any rendered cards
    const selectedCards = productsContainer.querySelectorAll(
      ".product-card.selected"
    );
    selectedCards.forEach((c) => c.classList.remove("selected"));
    // update UI and persist
    updateSelectedProductsUI();
    saveSelectedToStorage();
  });
}

/* --- New: Chat form submit now sends follow-up using full conversation history --- */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const text = (input && input.value && input.value.trim()) || "";
  if (!text) return;

  // If user hasn't generated a routine yet, restrict topics to related areas
  const hasRoutine = conversationMessages.some(
    (m) => m.role === "assistant" && m.content && m.content.length > 30
  );
  const allowedTopics =
    /skincare|haircare|makeup|fragrance|suncare|product|routine|ingredient|retinol|spf|cleanser|moistur|hair|skin|spf/i;

  // If the question is off-topic, refuse and show a short assistant message (do not call the API)
  if (!allowedTopics.test(text)) {
    // If no routine exists, keep the original guidance message
    if (!hasRoutine) {
      chatWindow.innerHTML = `<div>Please ask about skincare, haircare, makeup, fragrance, suncare, products, or routines.</div>`;
      return;
    }
    // For existing routine, append a polite refusal to the conversation so the user sees it
    const refusal = {
      role: "assistant",
      content:
        "Sorry — I can only answer questions related to the generated routine or topics like skincare, haircare, makeup, fragrance, suncare, products, and routines. Please rephrase your question.",
      // visible by default
    };
    conversationMessages.push(refusal);
    renderChatWindow();
    input.value = "";
    return;
  }

  // Append user's visible question to conversation history and render
  conversationMessages.push({ role: "user", content: text }); // show defaults to true
  renderChatWindow();
  chatWindow.innerHTML += "<div>Thinking…</div>";
  input.value = "";

  try {
    // Send only role+content to the worker (strip internal flags)
    const apiMessages = conversationMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Ask the worker to enable web search tools for this conversation turn when appropriate.
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: apiMessages,
        max_tokens: 500,
        temperature: 0.7,
        tools: ["web_search"],
        include_citations: true,
        max_search_results: 5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      chatWindow.innerHTML = `<div>Error from OpenAI: ${res.status} ${
        res.statusText
      }<pre style="white-space:pre-wrap">${escapeHtml(errText)}</pre></div>`;
      return;
    }

    const data = await res.json();
    const aiMessage =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (aiMessage) {
      conversationMessages.push({ role: "assistant", content: aiMessage });
      renderChatWindow();
    } else {
      chatWindow.innerHTML = "<div>AI did not return a valid reply.</div>";
    }
  } catch (err) {
    chatWindow.innerHTML = `<div>Request failed: ${escapeHtml(
      err.message
    )}</div>`;
  }
});
