import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, onSnapshot, updateDoc, getDoc, getDocs, collection, 
  query, where, increment, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const lobbyId = urlParams.get("id");

const FIVE_MINUTES = 5 * 60 * 1000;

let currentUser = null;
let userData = null;
let currentLobby = null;
let autoCloseTimer = null;
let countdownInterval = null;
let ocrResult = null;

if (!lobbyId) window.location.href = "lobbies.html";

// ============================================================
// AUTH + USER DATA
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    userData = userSnap.data();
  } else {
    userData = {
      uid: user.uid,
      email: user.email || "",
      ign: (user.email || "player").split("@")[0],
      mlbb_id: "",
      zone_id: "",
      elo: 1000,
      level: 3,
      stats: { matches: 0, wins: 0, losses: 0, mvp_count: 0 },
      created_at: new Date().toISOString()
    };
    await setDoc(userRef, userData);
  }

  listenLobby();
});

// ============================================================
// LOBBY LISTENER
// ============================================================
function listenLobby() {
  onSnapshot(doc(db, "lobbies", lobbyId), (docSnap) => {
    if (!docSnap.exists()) {
      alert("Өрөө хаагдсан байна.");
      window.location.href = "lobbies.html";
      return;
    }

    currentLobby = docSnap.data();

    if (currentLobby.status === "closed" || currentLobby.status === "finished") {
      alert("Энэ өрөө хаагдсан байна.");
      window.location.href = "lobbies.html";
      return;
    }

    document.getElementById("room-title").innerText = `${currentLobby.host_name}-ийн Өрөө`;

    // Host эсэх
    const isHost = currentUser.uid === currentLobby.host_uid;
    if (isHost) {
      document.getElementById("host-controls").style.display = "block";
    } else {
      document.getElementById("host-controls").style.display = "none";
    }

    // Auto-close timer (зөвхөн host, Match ID ороогүй)
    if (!currentLobby.moonton_match_id && isHost) {
      startAutoCloseTimer();
    } else {
      stopAutoCloseTimer();
    }

    // Match ID байвал QR + OCR хэсэг харуулах
    if (currentLobby.moonton_match_id) {
      document.getElementById("qr-placeholder").style.display = "none";
      document.getElementById("qr-container").style.display = "block";
      document.getElementById("display-match-id").innerText = currentLobby.moonton_match_id;

      const joinUrl = `${window.location.origin}/join.html?id=${currentLobby.moonton_match_id}`;
      document.getElementById("qr-image").src = 
        `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;

      const enterLink = document.getElementById("enter-lobby-link");
      if (enterLink) {
        enterLink.href = `https://play.mobilelegends.com/match/#/room?id=${currentLobby.moonton_match_id}&from=list`;
      }

      // OCR хэсэг зөвхөн host (эсвэл radiant[0]) -д харагдана
      const canSync = isHost || currentUser.uid === currentLobby.team_radiant?.[0]?.uid;
      document.getElementById("screenshot-section").style.display = canSync ? "block" : "none";
      document.getElementById("btn-sync-result").style.display = canSync ? "inline-block" : "none";
    }

    renderTeam("team-radiant-list", currentLobby.team_radiant || []);
    renderTeam("team-dire-list", currentLobby.team_dire || []);
  });
}

// ============================================================
// AUTO-CLOSE TIMER
// ============================================================
function startAutoCloseTimer() {
  if (autoCloseTimer) return;

  const createdAt = new Date(currentLobby.created_at).getTime();
  const elapsed = Date.now() - createdAt;
  const remaining = FIVE_MINUTES - elapsed;

  const timerDisplay = document.getElementById("auto-close-timer");
  timerDisplay.style.display = "inline-block";

  if (remaining <= 0) {
    closeRoom();
    return;
  }

  function updateCountdown() {
    const now = Date.now();
    const left = FIVE_MINUTES - (now - createdAt);
    if (left <= 0) {
      clearInterval(countdownInterval);
      return;
    }
    const mins = Math.floor(left / 60000);
    const secs = Math.floor((left % 60000) / 1000);
    timerDisplay.innerText = `⏱ ${mins}:${secs.toString().padStart(2, '0')} үлдсэн`;
  }
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);

  autoCloseTimer = setTimeout(closeRoom, remaining);
}

function stopAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const timerDisplay = document.getElementById("auto-close-timer");
  if (timerDisplay) timerDisplay.style.display = "none";
}

async function closeRoom() {
  try {
    const latestSnap = await getDoc(doc(db, "lobbies", lobbyId));
    if (latestSnap.exists() && !latestSnap.data().moonton_match_id) {
      await updateDoc(doc(db, "lobbies", lobbyId), { status: "closed" });
    }
  } catch (err) {
    console.error("Auto-close error:", err);
  }
}

window.addEventListener("beforeunload", () => {
  stopAutoCloseTimer();
});

// ============================================================
// TEAM RENDER
// ============================================================
function renderTeam(elemId, players) {
  const container = document.getElementById(elemId);
  if (players.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); padding: 12px 0;">Тоглогч байхгүй</p>`;
    return;
  }

  let html = "";
  players.forEach(p => {
    html += `
      <div class="player-row">
        <div>
          <strong>${p.ign}</strong> 
          <span style="font-size:12px; color:var(--text-muted);">(${p.mlbb_id})</span>
        </div>
        <div style="color:var(--accent); font-weight:700;">${p.elo || 1000} ELO</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ============================================================
// HOST MATCH ID ХАДГАЛАХ
// ============================================================
document.getElementById("btn-save-id").addEventListener("click", async () => {
  const mId = document.getElementById("input-moonton-id").value.trim();
  if (!mId) {
    alert("Moonton Match ID-гаа оруулна уу!");
    return;
  }

  try {
    await updateDoc(doc(db, "lobbies", lobbyId), { moonton_match_id: mId });
    stopAutoCloseTimer();
    alert("Match ID амжилттай хадгалагдлаа! QR код бүх тоглогчдод харагдаж байна.");
  } catch (err) {
    console.error("Save Match ID error:", err);
    alert("Алдаа: " + err.message);
  }
});

// ============================================================
// БАГТ ОРОХ
// ============================================================
async function joinTeam(teamName) {
  if (!userData) {
    alert("Хэрэглэгчийн мэдээлэл ачаалж байна, түр хүлээнэ үү...");
    return;
  }

  if (!userData.mlbb_id) {
    alert("Эхлээд Dashboard дээр MLBB ID-гаа оруулна уу!");
    window.location.href = "dashboard.html";
    return;
  }

  const pData = {
    uid: currentUser.uid,
    ign: userData.ign || "Player",
    mlbb_id: userData.mlbb_id,
    zone_id: userData.zone_id || "",
    elo: userData.elo || 1000
  };

  let radiant = (currentLobby.team_radiant || []).filter(p => p.uid !== currentUser.uid);
  let dire = (currentLobby.team_dire || []).filter(p => p.uid !== currentUser.uid);

  if (teamName === "radiant") {
    if (radiant.length >= 5) {
      alert("Radiant баг дүүрсэн байна!");
      return;
    }
    radiant.push(pData);
  }
  
  if (teamName === "dire") {
    if (dire.length >= 5) {
      alert("Dire баг дүүрсэн байна!");
      return;
    }
    dire.push(pData);
  }

  try {
    await updateDoc(doc(db, "lobbies", lobbyId), {
      team_radiant: radiant,
      team_dire: dire
    });
  } catch (err) {
    console.error("Join team error:", err);
    alert("Багт ороход алдаа гарлаа: " + err.message);
  }
}

document.getElementById("btn-join-radiant").onclick = () => joinTeam("radiant");
document.getElementById("btn-join-dire").onclick = () => joinTeam("dire");

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
      console.log("====================");

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

// OCR текстээс мэдээлэл задлах
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

  // Victory тодорхойлох
  if (/blue\s*team[\s\S]{0,30}victory/i.test(fullText) || 
      /victory[\s\S]{0,30}blue\s*team/i.test(fullText)) {
    result.winner = "Blue";
  } else if (/red\s*team[\s\S]{0,30}victory/i.test(fullText) || 
             /victory[\s\S]{0,30}red\s*team/i.test(fullText)) {
    result.winner = "Red";
  }

  // Score олох (жишээ: "1 VS 0")
  const scoreMatch = fullText.match(/(\d+)\s*VS\s*(\d+)/i);
  if (scoreMatch) {
    result.blueScore = parseInt(scoreMatch[1]);
    result.redScore = parseInt(scoreMatch[2]);
    if (!result.winner) {
      result.winner = result.blueScore > result.redScore ? "Blue" : "Red";
    }
  }

  // IGN-үүдийг олох
  let section = null;
  
  lines.forEach((line) => {
    // Section тодорхойлох
    if (/^blue\s*team$/i.test(line) || /^blue\s*team\s+victory/i.test(line)) {
      section = "blue";
      return;
    }
    if (/^red\s*team$/i.test(line) || /^red\s*team\s+victory/i.test(line)) {
      section = "red";
      return;
    }
    // Section дахин тодорхойлох (Victory гэх мэт)
    if (/blue\s*team/i.test(line) && !/victory/i.test(line) && section !== "blue") {
      section = "blue";
      return;
    }
    if (/red\s*team/i.test(line) && section !== "red") {
      section = "red";
      return;
    }

    // IGN-ийг таних
    const cleaned = line
      .replace(/[^\w\s\u0080-\uFFFF✿✦★☆|._-]/g, '')
      .trim();
    
    // Шалгуурууд
    const isIGN = 
      cleaned.length >= 2 &&
      cleaned.length <= 25 &&
      !/^(vs|victory|defeat|blue|red|team|mvp|match|game|battle|id)$/i.test(cleaned) &&
      !/^\d+$/.test(cleaned) &&
      !/^\d{2}:\d{2}/.test(cleaned) &&
      !/^\d+\s+vs\s+\d+$/i.test(cleaned) &&
      /[a-zA-Z\u0080-\uFFFF]/.test(cleaned) &&
      // Дор хаяж 2 үсэг (тоо, тэмдэгт биш)
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

  // Score-с winner дахин шалгах
  if (!result.winner && (result.blueScore > 0 || result.redScore > 0)) {
    result.winner = result.blueScore > result.redScore ? "Blue" : "Red";
  }

  return result;
}

// OCR үр дүнг UI-д харуулах
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

  // Анхааруулга
  if (!data.winner) {
    html += `<div class="ocr-warning">⚠ Ялагч тодорхойгүй — гараар засах шаардлагатай</div>`;
  }
  if (data.bluePlayers.length === 0 && data.redPlayers.length === 0) {
    html += `<div class="ocr-warning">⚠ Тоглогчдын нэр олдсонгүй — гараар засах шаардлагатай</div>`;
  }

  dataBox.innerHTML = html;

  // Гараар засах form
  let editHTML = `
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--text-muted);">🏆 Ялагч:</label>
      <select id="ocr-edit-winner" style="padding: 6px; width: 100%;">
        <option value="Blue" ${data.winner === 'Blue' ? 'selected' : ''}>🔵 Blue Team</option>
        <option value="Red" ${data.winner === 'Red' ? 'selected' : ''}>🔴 Red Team</option>
      </select>
    </div>
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--info);">🔵 Blue IGN-үүд (таслалаар тусгаарлана):</label>
      <input type="text" id="ocr-edit-blue" value="${data.bluePlayers.join(', ')}" style="padding: 6px; width: 100%; font-size: 12px;">
    </div>
    <div style="margin-bottom: 8px;">
      <label style="font-size: 12px; color: var(--danger);">🔴 Red IGN-үүд (таслалаар тусгаарлана):</label>
      <input type="text" id="ocr-edit-red" value="${data.redPlayers.join(', ')}" style="padding: 6px; width: 100%; font-size: 12px;">
    </div>
  `;
  editContainer.innerHTML = editHTML;
  editBox.style.display = "block";

  resultBox.style.display = "block";
}

// OCR цэвэрлэх
const btnClearOCR = document.getElementById("btn-clear-ocr");
if (btnClearOCR) {
  btnClearOCR.addEventListener("click", () => {
    document.getElementById("ocr-result").style.display = "none";
    document.getElementById("screenshot-input").value = "";
    ocrResult = null;
  });
}

// OCR үр дүнг баталгаажуулах
const btnApplyOCR = document.getElementById("btn-apply-ocr");
if (btnApplyOCR) {
  btnApplyOCR.addEventListener("click", async () => {
    if (!ocrResult) {
      alert("Эхлээд screenshot оруулна уу!");
      return;
    }

    // Гараар зассан утгуудыг авах
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

// OCR үр дүнгээр ELO бодох
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
      // Давхардлаас сэргийлэх
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

    // Lobby-г finished болгох
    await updateDoc(doc(db, "lobbies", lobbyId), { 
      status: "finished",
      win_team: data.winner,
      ocr_data: data,
      finished_at: new Date().toISOString()
    });

    let msg = `✅ Амжилттай! ${updatedCount} тоглогчийн ELO шинэчлэгдлээ.`;
    if (notFound.length > 0) {
      msg += `\n\n⚠ Олдоогүй IGN-үүд (Firestore-д бүртгэлгүй):\n${notFound.join('\n')}`;
    }
    
    alert(msg);
    btn.innerText = "✓ Дууссан";

  } catch (err) {
    console.error("Apply OCR error:", err);
    alert("Алдаа: " + err.message);
    btn.disabled = false;
    btn.innerText = "✓ Баталгаажуулах & ELO Бодох";
  }
}

// ============================================================
// MOONTON API-С ELO БОДОХ (нөөц арга)
// ============================================================
document.getElementById("btn-sync-result").addEventListener("click", async () => {
  if (!currentLobby.moonton_match_id) {
    alert("Match ID оруулаагүй байна!");
    return;
  }

  const syncBtn = document.getElementById("btn-sync-result");
  const statusText = document.getElementById("sync-status");
  syncBtn.disabled = true;
  syncBtn.innerText = "⏳ Үр дүн татаж байна...";
  statusText.innerText = "Moonton API-с мэдээлэл татаж байна...";

  try {
    const moontonId = currentLobby.moonton_match_id;
    const response = await fetch(`/api/mlbb-match?matchId=${moontonId}`);
    
    if (!response.ok) {
      throw new Error(`Сервер алдаа: ${response.status}`);
    }
    
    const data = await response.json();

    if (!data || data.status !== 200 || !data.data) {
      throw new Error(data?.message || "Тоглолт хараахан дуусаагүй эсвэл мэдээлэл олдсонгүй.");
    }

    const winTeam = data.data.win_team;
    const playerList = data.data.player_list || [];
    let updatedCount = 0;

    for (const player of playerList) {
      const q = query(collection(db, "users"), where("mlbb_id", "==", String(player.role_id)));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const uDoc = snap.docs[0];
        const isWin = player.team === winTeam;
        let elo = isWin ? 25 : -20;
        if (player.is_mvp) elo += 5;

        await updateDoc(doc(db, "users", uDoc.id), {
          elo: increment(elo),
          "stats.matches": increment(1),
          "stats.wins": increment(isWin ? 1 : 0),
          "stats.losses": increment(isWin ? 0 : 1),
          "stats.mvp_count": increment(player.is_mvp ? 1 : 0)
        });
        updatedCount++;
      }
    }

    await updateDoc(doc(db, "lobbies", lobbyId), { 
      status: "finished",
      win_team: winTeam
    });

    alert(`✅ Амжилттай! ${updatedCount} тоглогчийн ELO шинэчлэгдлээ.`);
    syncBtn.innerText = "✓ Тоглолт Дууссан";
    
  } catch (err) {
    console.error("Sync error:", err);
    alert("Алдаа: " + err.message + "\n\n💡 Зөвлөмж: Screenshot-аас уншуулах хэсгийг ашиглана уу.");
    syncBtn.disabled = false;
    syncBtn.innerText = "🔄 Moonton API-с ELO Бодох";
    statusText.innerText = "";
  }
});