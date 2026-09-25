import { db } from "./firebase-config.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const LOBBY_ID = "LOBBY_ROOM_001";

document.getElementById("btn-open-tool").addEventListener("click", () => {
  document.getElementById("modal").style.display = "flex";
});

document.getElementById("btn-close-modal").addEventListener("click", async () => {
  document.getElementById("modal").style.display = "none";
  const roomId = prompt("Moonton дээр үүссэн Match ID-г оруулна уу[cite: 1, 2]:");
  if (roomId) {
    await updateDoc(doc(db, "lobbies", LOBBY_ID), {
      room_id: roomId,
      qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${roomId}`
    });
  }
});

onSnapshot(doc(db, "lobbies", LOBBY_ID), (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (data.room_id) {
      document.getElementById("qr-area").style.display = "block";
      document.getElementById("room-id-text").innerText = data.room_id;
      document.getElementById("qr-img").src = data.qr_url;
    }
  }
});