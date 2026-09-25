import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, getDoc, setDoc, deleteDoc, collection, 
  onSnapshot, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = null;
let inQueue = false;
let matchListenerUnsub = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;

  try {
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

    if (!userData.mlbb_id) {
      alert("Matchmaking-д орохын тулд эхлээд Dashboard дээр MLBB ID-гаа оруулна уу!");
      window.location.replace("dashboard.html");
      return;
    }

    checkActiveMatch(user.uid);
  } catch (err) {
    console.error("User data fetch error:", err);
  }
});

onSnapshot(collection(db, "queue"), async (snapshot) => {
  const container = document.getElementById("player-container");
  const queueCountElem = document.getElementById("queue-count");
  
  const count = snapshot.size;
  if (queueCountElem) queueCountElem.innerText = count;

  if (snapshot.empty) {
    if (container) container.innerHTML = `<p style="text-align: center; color: #666;">Хүлээгдэж буй тоглогч байхгүй байна.</p>`;
    inQueue = false;
    updateQueueButton();
    return;
  }

  let html = "";
  inQueue = false;
  const playersList = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    playersList.push({ uid: docSnap.id, ...data });

    if (currentUser && docSnap.id === currentUser.uid) {
      inQueue = true;
    }

    html += `
      <div class="player-item">
        <div>
          <strong>${data.ign || 'N/A'}</strong>
          <span style="font-size:12px; color:#888;">(${data.mlbb_id})</span>
        </div>
        <div style="color:#ff5500; font-weight:bold;">${data.elo || 1000} ELO</div>
      </div>
    `;
  });

  if (container) container.innerHTML = html;
  updateQueueButton();

  if (count >= 10 && playersList[0].uid === currentUser?.uid) {
    await createMatch(playersList.slice(0, 10));
  }
});

function checkActiveMatch(uid) {
  if (matchListenerUnsub) matchListenerUnsub();

  const q = query(
    collection(db, "matches"), 
    where("status", "==", "ongoing"),
    where("player_uids", "array-contains", uid)
  );

  matchListenerUnsub = onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const matchDoc = snapshot.docs[0];
      window.location.replace(`match.html?id=${matchDoc.id}`);
    }
  }, (error) => {
    console.error("Match listener error:", error);
  });
}

async function createMatch(players) {
  const matchId = "MATCH_" + Date.now();
  
  const shuffled = [...players].sort(() => 0.5 - Math.random());
  const teamRadiant = shuffled.slice(0, 5);
  const teamDire = shuffled.slice(5, 10);
  const playerUids = players.map(p => p.uid);

  const matchData = {
    match_id: matchId,
    status: "ongoing",
    created_at: new Date().toISOString(),
    player_uids: playerUids,
    team_radiant: teamRadiant,
    team_dire: teamDire,
    moonton_match_id: ""
  };

  try {
    await setDoc(doc(db, "matches", matchId), matchData);
    for (const player of players) {
      await deleteDoc(doc(db, "queue", player.uid));
    }
  } catch (err) {
    console.error("Create Match Error:", err);
  }
}

const queueBtn = document.getElementById("btn-toggle-queue");
if (queueBtn) {
  queueBtn.addEventListener("click", async () => {
    if (!currentUser || !userData) {
      alert("Хэрэглэгчийн мэдээлэл ачаалж байна, түр хүлээнэ үү...");
      return;
    }

    const queueRef = doc(db, "queue", currentUser.uid);

    try {
      if (inQueue) {
        await deleteDoc(queueRef);
      } else {
        await setDoc(queueRef, {
          uid: currentUser.uid,
          ign: userData.ign || "Player",
          mlbb_id: userData.mlbb_id || "",
          zone_id: userData.zone_id || "",
          elo: userData.elo || 1000,
          joined_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Queue Toggle Error:", err);
      alert("Алдаа гарлаа: " + err.message);
    }
  });
}

function updateQueueButton() {
  const statusText = document.getElementById("queue-status");
  if (!queueBtn) return;

  if (inQueue) {
    queueBtn.innerText = "CANCEL QUEUE";
    queueBtn.className = "btn-cancel";
    if (statusText) {
      statusText.innerText = "Тоглоом хайж байна...";
      statusText.style.color = "#00ff66";
    }
  } else {
    queueBtn.innerText = "FIND MATCH";
    queueBtn.className = "btn-find";
    if (statusText) {
      statusText.innerText = "Тоглоом хайж эхлэхийн тулд дараах товчийг дарна уу.";
      statusText.style.color = "#aaa";
    }
  }
}