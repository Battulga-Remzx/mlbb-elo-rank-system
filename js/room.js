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

if (!lobbyId) window.location.href = "lobbies.html";

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

    if (currentUser.uid === currentLobby.host_uid) {
      document.getElementById("host-controls").style.display = "block";
    } else {
      document.getElementById("host-controls").style.display = "none";
    }

    // Auto-close timer (зөвхөн host, Match ID ороогүй үед)
    if (!currentLobby.moonton_match_id && currentUser.uid === currentLobby.host_uid) {
      startAutoCloseTimer();
    } else {
      stopAutoCloseTimer();
    }

    // Match ID байвал QR харуулах
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
    }

    renderTeam("team-radiant-list", currentLobby.team_radiant || []);
    renderTeam("team-dire-list", currentLobby.team_dire || []);
  });
}

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

function renderTeam(elemId, players) {
  const container = document.getElementById(elemId);
  if (players.length === 0) {
    container.innerHTML = `<p style="color:#666;">Тоглогч байхгүй</p>`;
    return;
  }

  let html = "";
  players.forEach(p => {
    html += `
      <div class="player-row">
        <div>
          <strong>${p.ign}</strong> 
          <span style="font-size:12px; color:#888;">(${p.mlbb_id})</span>
        </div>
        <div style="color:#ff5500; font-weight:bold;">${p.elo || 1000} ELO</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Host Match ID хадгалах
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

// Багт орох
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

// ELO бодох — Vercel API Proxy ашиглана
document.getElementById("btn-sync-result").addEventListener("click", async () => {
  if (!currentLobby.moonton_match_id) {
    alert("Match ID оруулаагүй байна!");
    return;
  }

  const syncBtn = document.getElementById("btn-sync-result");
  syncBtn.disabled = true;
  syncBtn.innerText = "⏳ Үр дүн татаж байна...";

  try {
    // ✅ Vercel Serverless Function руу хандах (CORS-гүй)
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

    await updateDoc(doc(db, "lobbies", lobbyId), { status: "finished" });
    alert(`✅ Тоглолтын үр дүн амжилттай бодогдлоо! ${updatedCount} тоглогчийн ELO шинэчлэгдлээ.`);
    
    syncBtn.innerText = "✓ Тоглолт Дууссан";
    
  } catch (err) {
    console.error("Sync error:", err);
    alert("Алдаа: " + err.message);
    syncBtn.disabled = false;
    syncBtn.innerText = "🔄 Тоглолт Дууссан → ELO Бодох";
  }
});