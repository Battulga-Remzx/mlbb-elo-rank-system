import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
  if (user) {
    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById("ign").innerText = d.ign;
        document.getElementById("mlbb-id").innerText = `ID: ${d.mlbb_id} (${d.zone_id})`;
        document.getElementById("elo").innerText = d.elo;
        document.getElementById("lvl").innerText = d.level;
      }
    });
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));