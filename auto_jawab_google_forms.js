/**
 * ============================================================================
 * GOOGLE FORMS AI AUTO-SOLVER v3.3
 * ============================================================================
 * Repository : Google Forms AI Auto-Solver
 * Author     : Dedi Darmawan
 * Engine     : Google Gemini API (Generative Language API v1beta)
 * License    : MIT
 * ============================================================================
 */

(async function runGoogleFormsAutoSolver() {
  'use strict';

  // ==================== KONFIGURASI UTAMA ====================
  const CONFIG = {
    // Ganti dengan API Key Google AI Studio Anda (https://aistudio.google.com/api-keys)
    API_KEY: "YOUR_GEMINI_API_KEY_HERE",

    // Model fallback standar Google AI Studio
    MODELS: [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash-exp",
      "gemini-flash-latest"
    ],

    BATCH_SIZE: 5,        // Jumlah soal teks per batch API call (hemat limit)
    CLICK_DELAY_MS: 250,   // Jeda animasi klik di layar (ms)
    MAX_RETRIES: 3,        // Maksimal coba ulang jika terkena Rate Limit (429)
    AUTO_SCROLL: true,     // Otomatis scroll ke soal yang sedang diisi
    SHOW_HUD: true         // Tampilkan panel melayang (HUD) di pojok kanan bawah
  };

  // Validasi API Key
  if (!CONFIG.API_KEY || CONFIG.API_KEY === "YOUR_GEMINI_API_KEY_HERE" || CONFIG.API_KEY.trim() === "") {
    console.error("❌ [ERROR] Masukkan API Key Anda di CONFIG.API_KEY terlebih dahulu!");
    alert("⚠️ API Key Gemini belum diisi! Silakan edit CONFIG.API_KEY pada script.");
    return;
  }

  console.clear();
  console.log(
    "%c🚀 GOOGLE FORMS AI AUTO-SOLVER v3.3 DIMULAI",
    "background:#1a73e8;color:#ffffff;font-weight:bold;padding:6px 12px;border-radius:6px;font-size:13px;"
  );

  // ==================== PANEL STATUS HUD (DOM AMAN / ANTI-CSP) ====================
  let hudEl = null, hudStatusEl = null, hudProgressEl = null;

  function initHUD() {
    if (!CONFIG.SHOW_HUD) return;
    const old = document.getElementById("gf-ai-hud");
    if (old) old.remove();

    hudEl = document.createElement("div");
    hudEl.id = "gf-ai-hud";
    hudEl.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "right:20px",
      "z-index:999999",
      "background:#0f172a",
      "color:#f8fafc",
      "padding:14px 18px",
      "border-radius:12px",
      "box-shadow:0 10px 25px rgba(0,0,0,0.35)",
      "font-family:system-ui,-apple-system,sans-serif",
      "font-size:13px",
      "min-width:290px",
      "border:1px solid #334155"
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
    
    const title = document.createElement("strong");
    title.style.color = "#38bdf8";
    title.textContent = "🤖 AI Form Solver v3.3";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;";
    closeBtn.onclick = () => hudEl.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    hudStatusEl = document.createElement("div");
    hudStatusEl.textContent = "Memeriksa model AI aktif...";
    hudStatusEl.style.fontWeight = "bold";

    hudProgressEl = document.createElement("div");
    hudProgressEl.style.cssText = "margin-top:6px;font-size:12px;color:#94a3b8;";

    hudEl.appendChild(header);
    hudEl.appendChild(hudStatusEl);
    hudEl.appendChild(hudProgressEl);
    document.body.appendChild(hudEl);
  }

  function updateHUD(statusText, progressText = "", color = "#e2e8f0") {
    if (hudStatusEl) {
      hudStatusEl.textContent = statusText;
      hudStatusEl.style.color = color;
    }
    if (hudProgressEl) hudProgressEl.textContent = progressText;
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const cleanStr = (s) => (s || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();

  // ==================== AUTO-DISCOVERY MODEL GEMINI ====================
  const deadModels = new Set();
  let activeModels = [...CONFIG.MODELS];

  async function discoverModels() {
    const key = CONFIG.API_KEY.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
          const found = data.models
            .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
            .map(m => (m.name || "").replace(/^models\//, ""))
            .filter(name => !/tts|embedding|imagen|veo|robotics/i.test(name));

          if (found.length > 0) {
            found.sort((a, b) => {
              if (a.includes("flash") && !b.includes("flash")) return -1;
              if (!a.includes("flash") && b.includes("flash")) return 1;
              return 0;
            });
            activeModels = Array.from(new Set([...found, ...CONFIG.MODELS]));
            console.log("✅ [Auto-Discovery] Model aktif terdeteksi:", activeModels.slice(0, 5).join(", "));
            return;
          }
        }
      }
    } catch (_) {}
    console.log("ℹ️ Menggunakan daftar model standar:", activeModels.join(", "));
  }

  // ==================== FILTER BIODATA (SKIP AUTOMATIC) ====================
  function isBioQuestion(titleText, hasChoices) {
    if (!hasChoices) return true;
    const clean = cleanStr(titleText).toLowerCase().replace(/^\d+[\.\)\-\s]+/, "");
    
    const bioKeywords = ["nama", "nim", "npm", "kelas", "prodi", "jurusan", "semester", "absen", "email", "token", "kelompok"];
    const isAcademic = ["apa", "apakah", "mengapa", "bagaimana", "hitunglah", "fungsi", "output", "program", "manakah", "?"].some(k => clean.includes(k));

    if (clean.length < 35 && !isAcademic) {
      if (bioKeywords.some(k => clean.includes(k))) return true;
    }
    return false;
  }

  // ==================== KONVERSI GAMBAR DOM KE BASE64 ====================
  async function imageElementToBase64(imgEl) {
    if (!imgEl || !imgEl.src) return null;
    if (imgEl.naturalWidth > 0 && imgEl.naturalWidth < 25) return null;

    if (imgEl.src.startsWith("data:image/")) {
      const match = imgEl.src.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) return { mimeType: match[1], data: match[2] };
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth || imgEl.width || 600;
      canvas.height = imgEl.naturalHeight || imgEl.height || 400;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0);
      return { mimeType: "image/png", data: canvas.toDataURL("image/png").split(",")[1] };
    } catch (_) {
      return null;
    }
  }

  // ==================== EKSTRAKSI STRUKTUR SOAL DARI GOOGLE FORMS ====================
  async function extractQuestionData(cardEl, index) {
    const heading = cardEl.querySelector('[role="heading"], .M7eMe');
    const desc = cardEl.querySelector('.gubaDc, .Id5V1');
    const titleText = heading ? heading.innerText : "";
    const descText = desc ? desc.innerText : "";
    const fullText = cleanStr(`${titleText}\n${descText}`);

    const radioEls = Array.from(cardEl.querySelectorAll('[role="radio"]'));
    const checkboxEls = Array.from(cardEl.querySelectorAll('[role="checkbox"]'));
    const isMultipleChoice = checkboxEls.length > 0;
    const rawOptionEls = isMultipleChoice ? checkboxEls : radioEls;

    if (rawOptionEls.length === 0 || isBioQuestion(fullText, true)) {
      return { index, cardEl, isBio: true, questionTitle: fullText || `Field #${index + 1}` };
    }

    const options = [];
    const optionImgSet = new Set();

    for (let i = 0; i < rawOptionEls.length; i++) {
      const optEl = rawOptionEls[i];
      const container = optEl.closest(".docssharedWizToggleLabeledContainer, .bzfPab, label") || optEl.parentElement;
      let optText = optEl.getAttribute("data-value") || optEl.getAttribute("aria-label") || container?.innerText || "";
      
      let optImg = null;
      if (container) {
        const imgs = container.querySelectorAll("img");
        for (const img of imgs) {
          optionImgSet.add(img);
          optImg = await imageElementToBase64(img);
          if (optImg) break;
        }
      }

      options.push({
        optionIndex: i,
        element: optEl,
        container,
        text: cleanStr(optText) || `(Opsi Gambar ${String.fromCharCode(65 + i)})`,
        image: optImg
      });
    }

    const questionImages = [];
    const allImgs = cardEl.querySelectorAll("img");
    for (const img of allImgs) {
      if (!optionImgSet.has(img)) {
        const b64 = await imageElementToBase64(img);
        if (b64) questionImages.push(b64);
      }
    }

    return {
      index,
      cardEl,
      isBio: false,
      questionTitle: titleText || fullText || `Soal #${index + 1}`,
      fullQuestionText: fullText || `Soal #${index + 1}`,
      isMultipleChoice,
      hasImages: questionImages.length > 0 || options.some(o => o.image !== null),
      questionImages,
      options
    };
  }

  // ==================== PEMANGGILAN GEMINI API (RETRY & BLACKLIST 404) ====================
  async function callGeminiApiWithRetry(parts) {
    const key = CONFIG.API_KEY.trim();
    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" }
    };

    const candidateModels = activeModels.filter(m => !deadModels.has(m));
    if (candidateModels.length === 0) {
      deadModels.clear();
      candidateModels.push(...activeModels);
    }

    let lastError = null;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

      for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (res.status === 404) {
            deadModels.add(model);
            console.warn(`⚠️ [HTTP 404] Model "${model}" tidak aktif. Otomatis dilewati.`);
            break;
          }

          if (res.status === 429) {
            const delay = Math.pow(2, attempt) * 1500 + Math.random() * 500;
            console.warn(`⏳ [Rate Limit 429] ${model} sibuk. Retry ke-${attempt + 1} dalam ${(delay / 1000).toFixed(1)}s...`);
            await sleep(delay);
            continue;
          }

          if (!res.ok) {
            const errTxt = await res.text();
            lastError = new Error(`HTTP ${res.status}: ${errTxt.slice(0, 100)}`);
            break;
          }

          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("").trim() || "";
          
          if (text) {
            return { rawText: text, modelUsed: model };
          }
        } catch (e) {
          lastError = e;
          await sleep(1000);
        }
      }
    }

    throw lastError || new Error("Gagal memanggil API Gemini pada seluruh model.");
  }

  // ==================== AI SOLVER HANDLERS ====================
  async function solveSingleQuestion(qData) {
    const optionLines = qData.options
      .map((o, idx) => `[Index ${idx}] (${String.fromCharCode(65 + idx)}) ${o.text}`)
      .join("\n");

    const prompt = `Jawab soal ujian berikut dengan akurat 100%.
Tipe Soal: ${qData.isMultipleChoice ? "MULTIPLE CHOICE (Dapat memilih >1 jawaban yang benar)" : "SINGLE CHOICE (Pilih TEPAT 1 jawaban paling benar)"}

PERTANYAAN:
${qData.fullQuestionText}

OPSI JAWABAN:
${optionLines}

Kembalikan HANYA JSON valid:
{
  "selected_indices": [angka_index],
  "reason": "Penjelasan singkat tepat mengapa jawaban ini benar"
}`;

    const parts = [{ text: prompt }];
    qData.questionImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
    qData.options.forEach(opt => {
      if (opt.image) parts.push({ inlineData: { mimeType: opt.image.mimeType, data: opt.image.data } });
    });

    const { rawText, modelUsed } = await callGeminiApiWithRetry(parts);
    const parsed = parseJsonIndices(rawText, qData.options.length, qData.isMultipleChoice);
    return { ...parsed, modelUsed };
  }

  async function solveBatchQuestions(batch) {
    const blocks = batch.map((q, bIdx) => {
      const opts = q.options.map((o, i) => `   [${i}] (${String.fromCharCode(65 + i)}) ${o.text}`).join("\n");
      return `=== SOAL ID: ${bIdx} (${q.isMultipleChoice ? "MULTIPLE" : "SINGLE"}) ===\n${q.fullQuestionText}\nOPSI:\n${opts}`;
    }).join("\n\n");

    const prompt = `Jawab seluruh ${batch.length} soal berikut secara akurat.
${blocks}

Kembalikan HANYA JSON valid:
{
  "answers": [
    { "id": 0, "selected_indices": [angka_index], "reason": "alasan singkat" }
  ]
}`;

    const { rawText, modelUsed } = await callGeminiApiWithRetry([{ text: prompt }]);
    const parsedList = parseBatchJson(rawText);
    const resultMap = new Map();

    parsedList.forEach(item => {
      if (typeof item.id === "number" && Array.isArray(item.selected_indices)) {
        let idxs = item.selected_indices.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < batch[item.id]?.options.length);
        if (!batch[item.id]?.isMultipleChoice && idxs.length > 1) idxs = [idxs[0]];
        resultMap.set(item.id, { selected_indices: idxs, reason: item.reason || "", modelUsed });
      }
    });

    return resultMap;
  }

  function parseJsonIndices(jsonStr, maxLen, isMultiple) {
    try {
      const clean = jsonStr.replace(/```json|```/g, "").trim();
      const obj = JSON.parse(clean);
      let idxs = Array.isArray(obj.selected_indices) ? obj.selected_indices : [];
      idxs = idxs.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < maxLen);
      if (!isMultiple && idxs.length > 1) idxs = [idxs[0]];
      return { selected_indices: idxs, reason: obj.reason || "" };
    } catch (_) {
      return { selected_indices: [0], reason: "Fallback default" };
    }
  }

  function parseBatchJson(jsonStr) {
    try {
      const clean = jsonStr.replace(/```json|```/g, "").trim();
      const obj = JSON.parse(clean);
      return Array.isArray(obj) ? obj : (obj.answers || []);
    } catch (_) {
      return [];
    }
  }

  // ==================== ESEKUSI KLIK DOM & CONSOLE LOGGING ====================
  async function applyAnswerAndLog(qData, aiResult, totalCount, stats) {
    const { cardEl, index, options, isMultipleChoice } = qData;
    const selectedIndices = aiResult.selected_indices || [0];

    if (CONFIG.AUTO_SCROLL) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(100);
    }

    const targetSet = new Set(selectedIndices);
    for (const opt of options) {
      const isChecked = opt.element.getAttribute("aria-checked") === "true";
      const shouldCheck = targetSet.has(opt.optionIndex);

      if (isChecked !== shouldCheck) {
        opt.element.click();
        await sleep(80);
        if ((opt.element.getAttribute("aria-checked") === "true") !== shouldCheck && opt.container) {
          opt.container.click();
        }
      }
    }

    stats.answered++;
    cardEl.style.transition = "outline 0.25s ease";
    cardEl.style.outline = "2px solid #22c55e";

    const chosenLabels = selectedIndices.map(i => {
      const letter = String.fromCharCode(65 + i);
      return `(${letter}) ${options[i]?.text || ""}`;
    }).join(" | ");

    // LOG DETAIL PER SOAL DI CONSOLE
    console.group(`✅ [SOAL #${index + 1}/${totalCount}] ${isMultipleChoice ? "Kotak Centang (Multiple)" : "Pilihan Ganda"}`);
    console.log(`📌 Pertanyaan  : ${qData.questionTitle}`);
    console.log(`🎯 Jawaban AI  : %c${chosenLabels}`, "color:#22c55e;font-weight:bold;font-size:12px;");
    if (aiResult.reason) {
      console.log(`💡 Alasan (${aiResult.modelUsed || "Gemini"}): ${aiResult.reason}`);
    }
    console.groupEnd();

    updateHUD(
      `✅ Soal #${index + 1}: ${chosenLabels.slice(0, 50)}...`,
      `Terjawab: ${stats.answered} | Skip Bio: ${stats.skipped} | Error: ${stats.error}`,
      "#4ade80"
    );

    await sleep(CONFIG.CLICK_DELAY_MS);
  }

  // ==================== ALUR EKSEKUSI UTAMA ====================
  initHUD();
  await discoverModels();

  const rawCards = Array.from(document.querySelectorAll('[role="listitem"]'));
  const cards = rawCards.filter(el => !el.parentElement?.closest('[role="listitem"]') && el.offsetParent !== null);

  if (cards.length === 0) {
    updateHUD("❌ Soal tidak ditemukan di halaman ini.", "", "#f87171");
    return;
  }

  const stats = { answered: 0, skipped: 0, error: 0 };
  const parsedQuestions = [];

  for (let i = 0; i < cards.length; i++) {
    updateHUD(`🔍 Memindai Soal #${i + 1} dari ${cards.length}...`, "", "#38bdf8");
    const q = await extractQuestionData(cards[i], i);
    if (q.isBio) {
      stats.skipped++;
      console.log(`⏭️ [SKIP BIO #${i + 1}] ${q.questionTitle}`);
    } else {
      parsedQuestions.push(q);
    }
  }

  let batch = [];
  async function processBatch() {
    if (batch.length === 0) return;
    const startNum = batch[0].index + 1;
    const endNum = batch[batch.length - 1].index + 1;
    
    updateHUD(`🧠 Menjawab Paket Soal #${startNum} - #${endNum}...`, `Terjawab: ${stats.answered}/${parsedQuestions.length}`, "#38bdf8");
    
    try {
      const resMap = await solveBatchQuestions(batch);
      for (let i = 0; i < batch.length; i++) {
        const q = batch[i];
        const res = resMap.get(i) || { selected_indices: [0], reason: "Fallback" };
        await applyAnswerAndLog(q, res, cards.length, stats);
      }
    } catch (err) {
      console.warn(`⚠️ Batch #${startNum}-#${endNum} beralih ke mode individual:`, err.message);
      for (const q of batch) {
        try {
          const singleRes = await solveSingleQuestion(q);
          await applyAnswerAndLog(q, singleRes, cards.length, stats);
        } catch (e) {
          stats.error++;
          q.cardEl.style.outline = "2px solid #ef4444";
        }
      }
    }
    batch = [];
  }

  for (const q of parsedQuestions) {
    if (q.hasImages) {
      await processBatch();
      updateHUD(`🖼️ Menganalisis Soal Gambar #${q.index + 1}...`, `Terjawab: ${stats.answered}/${parsedQuestions.length}`, "#38bdf8");
      try {
        const singleRes = await solveSingleQuestion(q);
        await applyAnswerAndLog(q, singleRes, cards.length, stats);
      } catch (e) {
        stats.error++;
        q.cardEl.style.outline = "2px solid #ef4444";
      }
    } else {
      batch.push(q);
      if (batch.length >= CONFIG.BATCH_SIZE) await processBatch();
    }
  }

  await processBatch();

  console.log("%c🎉 SELESAI! Seluruh soal berhasil dijawab.", "background:#16a34a;color:#fff;font-weight:bold;padding:6px 12px;font-size:13px;");
  console.table({
    "Total Blok di Halaman": cards.length,
    "Terjawab Otomatis": stats.answered,
    "Biodata Di-skip": stats.skipped,
    "Gagal / Error": stats.error
  });

  updateHUD("🎉 Selesai! Periksa jawaban sebelum Kirim/Submit.", `Terjawab: ${stats.answered} | Skip Bio: ${stats.skipped} | Error: ${stats.error}`, "#4ade80");
})();
