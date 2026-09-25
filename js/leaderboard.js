import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");

  try {
    const q = query(collection(db, "users"), orderBy("elo", "desc"), limit(50));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">Бүртгэлтэй тоглогч олдсонгүй.</td></tr>`;
      return;
    }

    let html = "";
    let rank = 1;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let rankClass = "";
      if (rank === 1) rankClass = "rank-1";
      else if (rank === 2) rankClass = "rank-2";
      else if (rank === 3) rankClass = "rank-3";

      html += `
        <tr>
          <td class="${rankClass}">#${rank}</td>
          <td><strong>${data.ign || "N/A"}</strong></td>
          <td style="color:#aaa;">${data.mlbb_id || '-'} ${data.zone_id ? `(${data.zone_id})` : ''}</td>
          <td><span style="background:#333; padding:2px 8px; border-radius:4px; font-size:12px;">LVL ${data.level || 3}</span></td>
          <td style="color:#ff5500; font-weight:bold;">${data.elo || 1000} ELO</td>
        </tr>
      `;
      rank++;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error("Leaderboard ачаалахад алдаа гарлаа:", err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ff4444;">Мэдээлэл татахад алдаа гарлаа. Firestore Index үүсгэсэн эсэхээ шалгана уу.</td></tr>`;
  }
}

loadLeaderboard();