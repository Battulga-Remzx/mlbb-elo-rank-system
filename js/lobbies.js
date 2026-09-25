import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, setDoc, doc, onSnapshot, query, where, getDoc, getDocs, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const FIVE_MINUTES = 5 * 60 * 1000;

let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    currentUserData = userSnap.data();
  } else {
    currentUserData = {
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
    await setDoc(userRef, currentUserData);
  }
});

// Нээлттэй өрөөнүүдийг Realtime харуулах + 5 минутаас хуучин бол хаах
const q = query(collection(db, "lobbies"), where("status", "==", "waiting"));

onSnapshot(q, (snapshot) => {
  const container = document.getElementById("lobbies-container");
  const now = Date.now();
  
  const activeLobbies = [];
  
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const createdAt = new Date(data.created_at).getTime();
    const age = now - createdAt;
    
    if (age < FIVE_MINUTES) {
      activeLobbies.push({ id: docSnap.id, ...data });
    } else {
      // 5 минутаас хуучин бол автоматаар хаах
      updateDoc(doc(db, "lobbies", docSnap.id), { status: "closed" })
        .catch(err => console.error("Auto-close error:", err));
    }
  });
  
  if (activeLobbies.length === 0) {
    container.innerHTML = `<p style="color: #666; text-align: center;">Одоогоор нээлттэй өрөө байхгүй байна. Та өөрөө өрөө нээнэ үү!</p>`;
    return;
  }

  let html = "";
  activeLobbies.forEach((data) => {
    const playerCount = (data.team_radiant?.length || 0) + (data.team_dire?.length || 0);
    const createdAt = new Date(data.created_at).getTime();
    const ageMinutes = Math.floor((now - createdAt) / 60000);
    const remainingMinutes = Math.max(0, 5 - ageMinutes);

    html += `
      <div class="lobby-card">
        <div>
          <strong style="font-size: 18px;">${data.host_name}-ийн Өрөө</strong>
          <div style="color: #aaa; font-size: 13px; margin-top: 4px;">
            Тоглогчид: <span style="color: #ff5500; font-weight: bold;">${playerCount}/10</span>
            <span style="color: #888; margin-left: 10px;">⏱ ${remainingMinutes} мин үлдсэн</span>
          </div>
        </div>
        <a href="room.html?id=${data.id}" class="btn-join">ОРХ (Join)</a>
      </div>
    `;
  });

  container.innerHTML = html;
});

// Шинэ Өрөө үүсгэх (нэг хэрэглэгч зөвхөн нэг room)
document.getElementById("btn-create-lobby").addEventListener("click", async (e) => {
  e.preventDefault();
  
  if (!currentUser) {
    alert("Нэвтрээгүй байна!");
    return;
  }

  if (!currentUserData || !currentUserData.mlbb_id) {
    alert("Өрөө нээхийн тулд эхлээд Dashboard дээр MLBB ID-гаа оруулна уу!");
    return;
  }

  const btn = e.target;
  btn.disabled = true;
  btn.innerText = "⏳ Шалгаж байна...";

  try {
    // Хэрэглэгч аль хэдийн room нээсэн эсэхийг шалгах
    const existingQuery = query(
      collection(db, "lobbies"),
      where("host_uid", "==", currentUser.uid),
      where("status", "==", "waiting")
    );
    const existingSnap = await getDocs(existingQuery);

    // 5 минутаас хуучин бол хаах
    if (!existingSnap.empty) {
      const oldDoc = existingSnap.docs[0];
      const oldData = oldDoc.data();
      const createdAt = new Date(oldData.created_at).getTime();
      const age = Date.now() - createdAt;

      if (age >= FIVE_MINUTES) {
        // Хуучин room хаах
        await updateDoc(doc(db, "lobbies", oldDoc.id), { status: "closed" });
      } else {
        // Идэвхтэй room байна
        const ageMinutes = Math.floor(age / 60000);
        const choice = confirm(
          `Та аль хэдийн нээлттэй өрөөтэй байна (${ageMinutes} минут өмнө үүссэн).\n\n` +
          `OK → Хуучин өрөө рүү шилжих\n` +
          `Cancel → Хуучин өрөөг хаагаад шинээр нээх`
        );

        if (choice) {
          window.location.href = `room.html?id=${oldDoc.id}`;
          return;
        } else {
          await updateDoc(doc(db, "lobbies", oldDoc.id), { status: "closed" });
        }
      }
    }

    // Шинэ room үүсгэх
    const lobbyId = "LOBBY_" + Date.now();
    
    const newLobby = {
      lobby_id: lobbyId,
      host_uid: currentUser.uid,
      host_name: currentUserData.ign || "Captain",
      status: "waiting",
      created_at: new Date().toISOString(),
      moonton_match_id: "",
      team_radiant: [],
      team_dire: []
    };

    await setDoc(doc(db, "lobbies", lobbyId), newLobby);
    window.location.href = `room.html?id=${lobbyId}`;

  } catch (err) {
    console.error("Create lobby error:", err);
    alert("Өрөө үүсгэхэд алдаа гарлаа: " + err.message);
    btn.disabled = false;
    btn.innerText = "➕ ӨРӨӨ НЭЭХ";
  }
});