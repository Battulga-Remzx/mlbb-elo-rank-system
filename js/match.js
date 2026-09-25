import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, onSnapshot, updateDoc, getDocs, collection, 
  query, where, increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const roomMatchId = urlParams.get("id");

let currentUser = null;
let currentMatchData = null;
let ocrResult = null;
let hasRedirected = false; // Давхар redirect-с сэргийлэх

if (!roomMatchId) {
  window.location.replace("matchmaking.html");
}

// ============================================================
// AUTH
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;
  listenMatchDetails();
});

// ============================================================
// MATCH LISTENER (match дууссан бол бүх тоглогч автоматаар гарна)
// ============================================================
function listenMatchDetails() {
  onSnapshot(doc(db, "matches", roomMatchId), (docSnap) => {
    if (!docSnap.exists()) {
      if (!hasRedirected) {
        hasRedirected = true;
        alert("Match олдсонгүй.");
        window.location.replace("matchmaking.html");
      }
      return;
    }

    currentMatchData = docSnap.data();

    // ⚠️ Match finished бол бүх тоглогч автоматаар гарна
    if (currentMatchData.status === "finished") {
      if (hasRedirected) return;
      hasRedirected = true;

      const winText = currentMatchData.win_team 
        ? `\n🏆 Ялагч: ${currentMatchData.win_team} Team` 
        : "";
      
      alert(`🚪 Тоглолт дууссан.${winText}\n\nMatchmaking хуудас руу шилжиж байна...`);
      window.location.replace("matchmaking.html");
      return;
    }

    const mode = currentMatchData.mode || "5v5";
    const is1v1 = mode === "1v1";

    const titleEl = document.querySelector(".match-title");
    if (titleEl) {
      titleEl.innerText = is1v1 ? "⚔ 1v1 DUEL ROOM" : "⚔ 5v5 TOURNAMENT LOBBY";
    }

    const captainUid = currentMatchData.team_radiant[0]?.uid;
    const isCaptain = currentUser && currentUser.uid === captainUid;

    if (isCaptain && currentMatchData.status === "ongoing") {
      document.getElementById("captain-control").style.display = "block";
    } else {
      document.getElementById("captain-control").style.display = "none";
    }

    if (is1v1) {
      const radiantTitle = document.querySelector(".team-box.radiant h3");
      const direTitle = document.querySelector(".team-box.dire h3");
      if (radiantTitle) radiantTitle.innerHTML = "⚔ PLAYER 1 (RADIANT)";
      if (direTitle) direTitle.innerHTML = "🔥 PLAYER 2 (DIRE)";
    }

    if (currentMatchData.moonton_match_id) {
      document.getElementById("lobby-wait-msg").style.display = "none";
      document.getElementById("lobby-active-info").style.display = "block";
      
      const mId = currentMatchData.moonton_match_id;
      document.getElementById("display-match-id").innerText = mId;

      const joinUrl = `${window.location.origin}/join.html?id=${mId}`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
      document.getElementById("qr-image").src = qrApiUrl;

      const enterLink = document.getElementById("enter-lobby-link");
      if (enterLink) {
        enterLink.href = `https://play.mobilelegends.com/match/#/room?id=${mId}&from=list`;
      }
      
      document.getElementById("room-status-display").innerText = "STATUS: LOBBY READY";
      document.getElementById("room-status-display").style.color = "var(--success)";

      // OCR хэсэг зөвхөн captain-д
      const ocrSection = document.getElementById("screenshot-section");
      if (ocrSection) {
        ocrSection.style.display = isCaptain ? "block" : "none";
      }
    }

    renderTeam("team-radiant-list", currentMatchData.team_radiant, captainUid, is1v1);
    renderTeam("team-dire-list", currentMatchData.team_dire, captainUid, is1v1);
  });
}

function renderTeam(elementId, players, captainUid, is1v1) {
  const container = document.getElementById(elementId);
  if (!players || players.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); padding: 12px 0;">Хүлээж байна...</p>`;
    return;
  }

  let html = "";
  players.forEach((p) => {
    const isCap = p.uid === captainUid;
    const showCaptain = !is1v1 && isCap;
    
    html += `
      <div class="player-row">
        <div>
          <strong>${p.ign}</strong> 
          ${showCaptain ? '<span class="captain-badge">CAPTAIN</span>' : ''}
          <br><span style="color: var(--text-muted); font-size: 12px;">ID: ${p.mlbb_id || 'N/A'}</span>
        </div>
        <div style="color: var(--accent); font-weight: 700;">${p.elo} ELO</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============================================================
// CAPTAIN MATCH ID НИЙТЛЭХ
// ============================================================
const publishBtn = document.getElementById("btn-publish-id");
if (publishBtn) {
  publishBtn.addEventListener("click", async () => {
    const moontonId = document.getElementById("input-moonton-id").value.trim();
    if (!moontonId) {
      alert("Moonton Match ID-гаа оруулна уу!");
      return;
    }

    try {
      await updateDoc(doc(db, "matches", roomMatchId), {
        moonton_match_id: moontonId
      });
      alert("✅ Match ID болон QR код бусад тоглогчдод амжилттай дамжуулагдлаа!");
    } catch (err) {
      console.error("Publish error:", err);
      alert("Алдаа: " + err.message);
    }
  });
}

// ============================================================
// 📸 SCREENSHOT OCR
// ============================================================
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Tesseract.js ачаалж чадсангүй'));
    document.head.appendChild(script);
  });
}

const screenshotInput = document.getElementById("screenshot-input");
if (screenshotInput) {
  screenshotInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const progressBox = document.getElementById("ocr-progress");
    const progressBar = document.getElementById("ocr-progress-bar");
    const statusText = document.getElementById("ocr-status");
    const resultBox = document.getElementById("ocr-result");

    progressBox.style.display = "block";
    resultBox.style.display = "none";
    progressBar.style.width = "5%";
    statusText.innerText = "Tesseract.js ачаалж байна...";

    try {
      const Tesseract = await loadTesseract();
      
      progressBar.style.width = "15%";
      statusText.innerText = "Зургийг боловсруулж байна...";

      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = 15 + Math.round(m.progress * 75);
            progressBar.style.width = `${progress}%`;
            statusText.innerText = `Уншиж байна... ${Math.round(m.progress * 100)}%`;
          }
        }
      });

      progressBar.style.width = "100%";
      statusText.innerText = "✓ Уншиж дууслаа!";

      const rawText = result.data.text;
      console.log("=== OCR Raw Text ===");
      console.log(rawText);

      ocrResult = parseMatchScreenshot(rawText);
      console.log("Parsed:", ocrResult);

      displayOCRResult(ocrResult);

      setTimeout(() => {
        progressBox.style.display = "none";
      }, 1000);

    } catch (err) {
      console.error("OCR Error:", err);
      statusText.innerText = "❌ Алдаа: " + err.message;
      progressBar.style.background = "var(--danger)";
    }
  });
}

function parseMatchScreenshot(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const fullText = lines.join(' ');
  
  const result = {
    winner: null,
    blueScore: 0,
    redScore: 0,
    bluePlayers: [],
    redPlayers: []
  };

  if (/blue\s*team[\s\S]{0,30}victory/i.test(fullText) || 
      /victory[\s\S]{0,30}blue\s*team/i.test(fullText)) {
    result.winner = "Blue";
  } else if (/red\s*team[\s\S]{0,30}victory/i.test(fullText) || 
             /victory[\s\S]{0,30}red\s*team/i.test(fullText)) {
    result.winner = "Red";
  }

  const scoreMatch = fullText.match(/(\d+)\s*VS\s*(\d+)/i);
  if (scoreMatch) {
    result.blueScore = parseInt(scoreMatch[1]);
    result.redScore = parseInt(scoreMatch[2]);
    if (!result.winner) {
      result.winner = result.blueScore > result.redScore ? "Blue" : "Red";
    }
  }

  let section = null;
  
  lines.forEach((line) => {
    if (/^blue\s*team$/i.test(line) || /^blue\s*team\s+victory/i.test(line)) {
      section = "blue";
      return;
    }
    if (/^red\s*team$/i.test(line) || /^red\s*team\s+victory/i.test(line)) {
      section = "red";
      return;
    }
    if (/blue\s*team/i.test(line) && !/victory/i.test(line) && section !== "blue") {
      section = "blue";
      return;
    }
    if (/red\s*team/i.test(line) && section !== "red") {
      section = "red";
      return;
    }

    const cleaned = line
      .replace(/[^\w\s\u0080-\uFFFF✿✦★☆|._-]/g, '')
      .trim();
    
    const isIGN = 
      cleaned.length >= 2 &&
      cleaned.length <= 25 &&
      !/^(vs|victory|defeat|blue|red|team|mvp|match|game|battle|id)$/i.test(cleaned) &&
      !/^\d+$/.test(cleaned) &&
      !/^\d{2}:\d{2}/.test(cleaned) &&
      !/^\d+\s+vs\s+\d+$/i.test(cleaned) &&
      /[a-zA-Z\u0080-\uFFFF]/.test(cleaned) &&
      (cleaned.match(/[a-zA-Z\u0080-\uFFFF]/g) || []).length >= 2;

    if (section === "blue" && isIGN && result.bluePlayers.length < 5) {
      if (!result.bluePlayers.includes(cleaned)) {
        result.bluePlayers.push(cleaned);
      }
    } else if (section === "red" && isIGN && result.redPlayers.length < 5) {
      if (!result.redPlayers.includes(cleaned)) {
        result.redPlayers.push(cleaned);
      }
    }
  });

  if (!result.winner && (result.blueScore > 0 || result.redScore > 0)) {
    result.winner = result.blueScore > result.redScore ? "Blue" : "Red";
  }

  return result;
}

function displayOCRResult(data) {
  const resultBox = document.getElementById("ocr-result");
  const dataBox = document.getElementById("ocr-data");
  const editBox = document.getElementById("ocr-editable");
  const editContainer = document.getElementById("ocr-edit-container");

  let html = `
    <div style="margin-bottom: 8px;">
      <strong>🏆 Ялагч:</strong> 
      <span style="color: ${data.winner === 'Blue' ? 'var(--info)' : data.winner === 'Red' ? 'var(--danger)' : 'var(--text-muted)'}; font-weight: 700;">
        ${data.winner === 'Blue' ? '🔵 Blue Team' : data.winner === 'Red' ? '🔴 Red Team' : '❓ Тодорхойгүй'}
      </span>
    </div>
    <div style="margin-bottom: 12px;">
      <strong>📊 Score:</strong> 
      <span style="color: var(--info); font-weight: 700;">${data.blueScore}</span> 
      VS 
      <span style="color: var(--danger); font-weight: 700;">${data.redScore}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span class="ocr-team-blue">🔵 Blue Players (${data.bluePlayers.length}):</span>
      <div class="ocr-player-list" style="color: var(--info);">
        ${data.bluePlayers.length ? data.bluePlayers.map(p => `• ${p}`).join('<br>') : '<span style="color: var(--text-muted);">Олдсонгүй</span>'}
      </div>
    </div>
    <div>
      <span class="ocr-team-red">🔴 Red Players (${data.redPlayers.length}):</span>
      <div class="ocr-player-list" style="color: var(--danger);">
        ${data.redPlayers.length ? data.redPlayers.map(p => `• ${p}`).join('<br>') : '<span style="color: var(--text-muted);">Олдсонгүй</span>'}
      </div>
    </div>
  `;

  if (!data.winner) {
    html += `<div class="ocr-warning">⚠ Ялагч тодорхойгүй — гараар засах шаардлагатай</div>`;
  }
  if (data.bluePlayers.length === 0 && data.redPlayers.length === 0) {
    html += `<div class="ocr-warning">⚠ Тоглогчдын нэр олдсонгүй — гараар засах шаардлагатай</div>`;
  }

  dataBox.innerHTML = html;

  let editHTML = `
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--text-muted);">🏆 Ялагч:</label>
      <select id="ocr-edit-winner" style="padding: 6px; width: 100%;">
        <option value="Blue" ${data.winner === 'Blue' ? 'selected' : ''}>🔵 Blue Team</option>
        <option value="Red" ${data.winner === 'Red' ? 'selected' : ''}>🔴 Red Team</option>
      </select>
    </div>
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--info);">🔵 Blue IGN-үүд:</label>
      <input type="text" id="ocr-edit-blue" value="${data.bluePlayers.join(', ')}" style="padding: 6px; width: 100%; font-size: 12px;">
    </div>
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--danger);">🔴 Red IGN-үүд:</label>
      <input type="text" id="ocr-edit-red" value="${data.redPlayers.join(', ')}" style="padding: 6px; width: 100%; font-size: 12px;">
    </div>
  `;
  editContainer.innerHTML = editHTML;
  editBox.style.display = "block";

  resultBox.style.display = "block";
}

const btnClearOCR = document.getElementById("btn-clear-ocr");
if (btnClearOCR) {
  btnClearOCR.addEventListener("click", () => {
    document.getElementById("ocr-result").style.display = "none";
    document.getElementById("screenshot-input").value = "";
    ocrResult = null;
  });
}

const btnApplyOCR = document.getElementById("btn-apply-ocr");
if (btnApplyOCR) {
  btnApplyOCR.addEventListener("click", async () => {
    if (!ocrResult) {
      alert("Эхлээд screenshot оруулна уу!");
      return;
    }

    const editWinner = document.getElementById("ocr-edit-winner")?.value;
    const editBlue = document.getElementById("ocr-edit-blue")?.value;
    const editRed = document.getElementById("ocr-edit-red")?.value;

    if (editWinner) ocrResult.winner = editWinner;
    if (editBlue !== undefined) {
      ocrResult.bluePlayers = editBlue.split(',').map(s => s.trim()).filter(s => s);
    }
    if (editRed !== undefined) {
      ocrResult.redPlayers = editRed.split(',').map(s => s.trim()).filter(s => s);
    }

    if (!ocrResult.winner) {
      alert("Ялагч багийг сонгоно уу!");
      return;
    }

    if (ocrResult.bluePlayers.length === 0 && ocrResult.redPlayers.length === 0) {
      alert("Дор хаяж нэг тоглогчийн IGN оруулна уу!");
      return;
    }

    await applyOCRResultToELO(ocrResult);
  });
}

async function applyOCRResultToELO(data) {
  const btn = document.getElementById("btn-apply-ocr");
  btn.disabled = true;
  btn.innerText = "⏳ ELO бодож байна...";

  try {
    const allIGNs = [...data.bluePlayers, ...data.redPlayers];
    let updatedCount = 0;
    const notFound = [];
    const alreadyProcessed = new Set();

    for (const ign of allIGNs) {
      if (alreadyProcessed.has(ign)) continue;
      alreadyProcessed.add(ign);

      const q = query(collection(db, "users"), where("ign", "==", ign));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        
        const isBlue = data.bluePlayers.includes(ign);
        const isRed = data.redPlayers.includes(ign);
        
        const isWinner = 
          (data.winner === "Blue" && isBlue) || 
          (data.winner === "Red" && isRed);

        const eloChange = isWinner ? 25 : -20;

        await updateDoc(doc(db, "users", userDoc.id), {
          elo: increment(eloChange),
          "stats.matches": increment(1),
          "stats.wins": increment(isWinner ? 1 : 0),
          "stats.losses": increment(isWinner ? 0 : 1)
        });

        updatedCount++;
        console.log(`✅ ${ign}: ${isWinner ? '+25' : '-20'} ELO`);
      } else {
        notFound.push(ign);
        console.warn(`⚠ ${ign} — Firestore-д олдсонгүй`);
      }
    }

    // ⚠️ Match-ийг finished болгох → listener бүх тоглогчийг автоматаар гаргана
    await updateDoc(doc(db, "matches", roomMatchId), { 
      status: "finished",
      win_team: data.winner,
      ocr_data: data,
      finished_at: new Date().toISOString(),
      closed_at: new Date().toISOString()
    });

    let msg = `✅ Амжилттай! ${updatedCount} тоглогчийн ELO шинэчлэгдлээ.`;
    if (notFound.length > 0) {
      msg += `\n\n⚠ Олдоогүй IGN-үүд:\n${notFound.join('\n')}`;
    }
    msg += `\n\n🚪 Match хаагдаж байна...`;
    
    alert(msg);
    btn.innerText = "✓ Дууссан";

    // hasRedirected-г true болгосноор listener дахин redirect хийхгүй
    hasRedirected = true;

    // 2 секундын дараа matchmaking.html руу шилжих
    setTimeout(() => {
      window.location.replace("matchmaking.html");
    }, 2000);

  } catch (err) {
    console.error("Apply OCR error:", err);
    alert("Алдаа: " + err.message);
    btn.disabled = false;
    btn.innerText = "✓ Баталгаажуулах & ELO Бодох";
  }
}