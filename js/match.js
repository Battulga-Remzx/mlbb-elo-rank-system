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

if (!roomMatchId) {
  window.location.replace("matchmaking.html");
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;
  listenMatchDetails();
});

function listenMatchDetails() {
  onSnapshot(doc(db, "matches", roomMatchId), (docSnap) => {
    if (!docSnap.exists()) {
      alert("Match олдсонгүй.");
      window.location.replace("matchmaking.html");
      return;
    }

    currentMatchData = docSnap.data();

    const captainUid = currentMatchData.team_radiant[0]?.uid;
    const isCaptain = currentUser && currentUser.uid === captainUid;

    if (isCaptain && currentMatchData.status === "ongoing") {
      document.getElementById("captain-control").style.display = "block";
    } else {
      document.getElementById("captain-control").style.display = "none";
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
      document.getElementById("room-status-display").style.color = "#00ff66";
    }

    if (currentMatchData.status === "finished") {
      document.getElementById("room-status-display").innerText = "STATUS: FINISHED";
      const syncBtn = document.getElementById("btn-sync-result");
      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerText = "✓ Тоглолт Дууссан";
      }
    }

    renderTeam("team-radiant-list", currentMatchData.team_radiant, captainUid);
    renderTeam("team-dire-list", currentMatchData.team_dire, captainUid);
  });
}

function renderTeam(elementId, players, captainUid) {
  const container = document.getElementById(elementId);
  if (!players || players.length === 0) {
    container.innerHTML = `<p style="color:#666;">Тоглогч байхгүй</p>`;
    return;
  }

  let html = "";
  players.forEach((p) => {
    const isCap = p.uid === captainUid;
    html += `
      <div class="player-row">
        <div>
          <strong>${p.ign}</strong> 
          ${isCap ? '<span class="captain-badge">CAPTAIN</span>' : ''}
          <br><span style="color:#888; font-size:12px;">ID: ${p.mlbb_id || 'N/A'}</span>
        </div>
        <div style="color:#ff5500; font-weight:bold;">${p.elo} ELO</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Captain Match ID нийтлэх
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

// ELO бодох — Vercel API Proxy ашиглана
const syncBtn = document.getElementById("btn-sync-result");
if (syncBtn) {
  syncBtn.addEventListener("click", async () => {
    const statusText = document.getElementById("sync-status");
    
    if (!currentMatchData || !currentMatchData.moonton_match_id) {
      alert("Эхлээд Captain Moonton Match ID-г оруулсан байх шаардлагатай!");
      return;
    }

    const moontonId = currentMatchData.moonton_match_id;
    statusText.innerText = "⏳ play.mobilelegends.com-оос тоглолтын үр дүн татаж байна...";
    syncBtn.disabled = true;

    try {
      // ✅ Vercel Serverless Function руу хандах (CORS-гүй)
      const response = await fetch(`/api/mlbb-match?matchId=${moontonId}`);
      
      if (!response.ok) {
        throw new Error(`Сервер алдаа: ${response.status}`);
      }
      
      const data = await response.json();

      if (!data || data.status !== 200 || !data.data) {
        throw new Error(data?.message || "Тоглолт хараахан дуусаагүй эсвэл мэдээлэл олдсонгүй.");
      }

      const resultData = data.data;
      const winningTeam = resultData.win_team; 
      const playerList = resultData.player_list || [];

      statusText.innerText = "⏳ Тоглогчдын ELO болон Статистик шинэчилж байна...";

      let updatedCount = 0;
      for (const player of playerList) {
        const q = query(collection(db, "users"), where("mlbb_id", "==", String(player.role_id)));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const isWinner = player.team === winningTeam;

          let eloChange = isWinner ? 25 : -20;
          if (player.is_mvp) eloChange += 5;

          await updateDoc(doc(db, "users", userDoc.id), {
            elo: increment(eloChange),
            "stats.matches": increment(1),
            "stats.wins": increment(isWinner ? 1 : 0),
            "stats.losses": increment(isWinner ? 0 : 1),
            "stats.mvp_count": increment(player.is_mvp ? 1 : 0)
          });
          updatedCount++;
        }
      }

      await updateDoc(doc(db, "matches", roomMatchId), {
        status: "finished",
        win_team: winningTeam
      });

      statusText.innerText = `✅ Амжилттай! ${updatedCount} тоглогчийн ELO шинэчлэгдлээ.`;
      alert(`Тоглолтын үр дүн бодогдож, ${updatedCount} тоглогчийн ELO оноо шинэчлэгдлээ!`);

    } catch (error) {
      console.error("Sync Error:", error);
      statusText.innerText = `❌ Алдаа: ${error.message}`;
      alert(`Алдаа гарлаа: ${error.message}`);
      syncBtn.disabled = false;
    }
  });
}