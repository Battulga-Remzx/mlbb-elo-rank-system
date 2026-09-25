import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const q = query(collection(db, "users"), orderBy("elo", "desc"), limit(100));

onSnapshot(q, (snap) => {
  const tbody = document.getElementById("lb-table");
  tbody.innerHTML = "";
  snap.docs.forEach((doc, idx) => {
    const d = doc.data();
    tbody.innerHTML += `
      <tr>
        <td style="color: #ff5500; font-weight: bold;">${idx + 1}</td>
        <td><strong>${d.ign}</strong></td>
        <td>Level ${d.level}</td>
        <td style="color: #ff5500;">${d.elo}</td>
      </tr>
    `;
  });
});