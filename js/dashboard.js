import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  currentUser = user;

  try {
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      userData = userDoc.data();
    } else {
      console.warn("User document олдсонгүй, шинээр үүсгэж байна...");
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

    renderDashboard(userData);
  } catch (err) {
    console.error("Dashboard Ачаалахад алдаа гарлаа:", err);
    alert("Мэдээлэл ачаалахад алдаа гарлаа: " + err.message);
  }
});

function renderDashboard(data) {
  document.getElementById("user-ign").innerText = data.ign || "Тохируулаагүй";
  document.getElementById("user-mlbb").innerText = data.mlbb_id 
    ? `${data.mlbb_id} (${data.zone_id || '-'})` 
    : "Тохируулаагүй";
  document.getElementById("user-email").innerText = data.email || "-";
  document.getElementById("user-elo").innerText = data.elo || 1000;
  document.getElementById("user-level").innerText = `LEVEL ${data.level || 3}`;

  const stats = data.stats || { matches: 0, wins: 0, losses: 0 };
  document.getElementById("stat-matches").innerText = stats.matches;
  document.getElementById("stat-wins").innerText = stats.wins;
  document.getElementById("stat-losses").innerText = stats.losses;

  const winrate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
  document.getElementById("stat-winrate").innerText = `${winrate}%`;
}

document.getElementById("btn-logout").addEventListener("click", () => {
  signOut(auth).then(() => window.location.replace("index.html"));
});

const modal = document.getElementById("edit-modal");
const btnEdit = document.getElementById("btn-edit-mlbb");
const btnCancel = document.getElementById("btn-cancel-edit");
const btnSave = document.getElementById("btn-save-edit");

btnEdit.addEventListener("click", () => {
  document.getElementById("edit-ign").value = userData?.ign || "";
  document.getElementById("edit-mlbb-id").value = userData?.mlbb_id || "";
  document.getElementById("edit-zone-id").value = userData?.zone_id || "";
  modal.style.display = "flex";
});

btnCancel.addEventListener("click", () => {
  modal.style.display = "none";
});

btnSave.addEventListener("click", async () => {
  const ign = document.getElementById("edit-ign").value.trim();
  const mlbbId = document.getElementById("edit-mlbb-id").value.trim();
  const zoneId = document.getElementById("edit-zone-id").value.trim();

  if (!ign) {
    alert("Тоглоомын нэрээ оруулна уу!");
    return;
  }

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      ign: ign,
      mlbb_id: mlbbId,
      zone_id: zoneId
    }, { merge: true });

    userData.ign = ign;
    userData.mlbb_id = mlbbId;
    userData.zone_id = zoneId;
    renderDashboard(userData);
    modal.style.display = "none";
    alert("Амжилттай хадгалагдлаа!");
  } catch (err) {
    console.error("Save error:", err);
    alert("Алдаа гарлаа: " + err.message);
  }
});