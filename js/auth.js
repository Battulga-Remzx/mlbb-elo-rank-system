import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDocs, 
  collection, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Vercel Serverless Function-ийн харьцангуй зам (Relative Path)
const VERIFY_API_URL = "/api/verify-mlbb";

let isSignUp = false;
let verifiedIGN = null; // API-аар баталгаажсан тоглоомын нэрийг хадгалах хувьсагч

// 1. Login / Register хэлбэрүүдийн хооронд шилжих (Toggle)
const toggleBtn = document.getElementById("toggle-btn");
const formTitle = document.getElementById("form-title");
const mlbbVerifySection = document.getElementById("mlbb-verify-section");
const btnSubmit = document.getElementById("btn-submit");

if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    isSignUp = !isSignUp;
    formTitle.innerText = isSignUp ? "CREATE ACCOUNT" : "FACEIT LOGIN";
    mlbbVerifySection.style.display = isSignUp ? "block" : "none";
    btnSubmit.innerText = isSignUp ? "Бүртгүүлэх" : "Нэвтрэх";
    toggleBtn.innerText = isSignUp ? "Бүртгэлтэй юу? Нэвтрэх" : "Шинээр бүртгүүлэх";
    
    // Шилжихэд өмнөх шалгалтын үр дүнг цэвэрлэх
    verifiedIGN = null;
    const resultBox = document.getElementById("verify-result");
    if (resultBox) resultBox.style.display = "none";
  });
}

// 2. MLBB ID & Server ID-г Vercel API-аар шалгаж IGN татах
const btnCheckMlbb = document.getElementById("btn-check-mlbb");
if (btnCheckMlbb) {
  btnCheckMlbb.addEventListener("click", async () => {
    const mlbbIdInput = document.getElementById("mlbb-id");
    const zoneIdInput = document.getElementById("zone-id");
    const resultBox = document.getElementById("verify-result");
    const ignDisplay = document.getElementById("fetched-ign");

    const mlbbId = mlbbIdInput ? mlbbIdInput.value.trim() : "";
    const zoneId = zoneIdInput ? zoneIdInput.value.trim() : "";

    if (!mlbbId || !zoneId) {
      alert("MLBB ID болон Server ID-г оруулна уу!");
      return;
    }

    // Төлөвийг уншиж байна болгох
    resultBox.style.display = "block";
    ignDisplay.className = "ign-status";
    ignDisplay.innerText = "⏳ MLBB Серверээс шалгаж байна...";
    btnCheckMlbb.disabled = true;

    try {
      const response = await fetch(VERIFY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mlbb_id: mlbbId,
          zone_id: zoneId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        verifiedIGN = data.username; // Автоматаар олдсон тоглоомын нэр
        ignDisplay.className = "ign-status ign-found";
        ignDisplay.innerText = `🎮 ${verifiedIGN}`;
      } else {
        verifiedIGN = null;
        ignDisplay.className = "ign-status ign-error";
        ignDisplay.innerText = `❌ ${data.message || "MLBB акаунт олдсонгүй"}`;
      }
    } catch (error) {
      console.error("API Error:", error);
      verifiedIGN = null;
      ignDisplay.className = "ign-status ign-error";
      ignDisplay.innerText = "❌ Сервертэй холбогдоход алдаа гарлаа.";
    } finally {
      btnCheckMlbb.disabled = false;
    }
  });
}

// 3. Нэвтрэх эсвэл Бүртгүүлэх үйлдэл хийх
if (btnSubmit) {
  btnSubmit.addEventListener("click", async () => {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email || !password) {
      alert("Имэйл болон нууц үгээ бүрэн оруулна уу!");
      return;
    }

    try {
      if (isSignUp) {
        const mlbbIdInput = document.getElementById("mlbb-id");
        const zoneIdInput = document.getElementById("zone-id");
        const mlbbId = mlbbIdInput ? mlbbIdInput.value.trim() : "";
        const zoneId = zoneIdInput ? zoneIdInput.value.trim() : "";

        // Шаардлагатай баталгаажуулалтууд
        if (!mlbbId || !zoneId) {
          alert("MLBB ID болон Server ID-гаа оруулна уу!");
          return;
        }

        if (!verifiedIGN) {
          alert("Эхлээд 'Тоглоомын нэр шалгах' товч дээр дарж MLBB акаунтаа баталгаажуулна уу!");
          return;
        }

        btnSubmit.innerText = "Бүртгэж байна...";
        btnSubmit.disabled = true;

        // Firestore дээр MLBB ID давхардсан эсэхийг шалгах
        const q = query(
          collection(db, "users"), 
          where("mlbb_id", "==", mlbbId), 
          where("zone_id", "==", zoneId)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          alert("Энэ MLBB ID өөр аккаунт дээр бүртгэгдсэн байна!");
          btnSubmit.innerText = "Бүртгүүлэх";
          btnSubmit.disabled = false;
          return;
        }

        // Firebase Auth дээр шинэ хэрэглэгч үүсгэх
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firestore дээр хэрэглэгчийн баталгаажсан профиль хадгалах
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: email,
          ign: verifiedIGN,         // Auto-fetched MLBB Name
          mlbb_id: mlbbId,
          zone_id: zoneId,
          elo: 1000,
          level: 3,
          stats: {
            matches: 0,
            wins: 0,
            losses: 0,
            mvp_count: 0
          },
          created_at: new Date().toISOString()
        });

        alert(`Амжилттай бүртгэгдлээ! Тавтай морил, ${verifiedIGN}`);
      } else {
        btnSubmit.innerText = "Нэвтэрч байна...";
        btnSubmit.disabled = true;
        
        // Firebase Auth нэвтрэх
        await signInWithEmailAndPassword(auth, email, password);
      }

      // Амжилттай бол Dashboard руу шилжих
      window.location.href = "dashboard.html";

    } catch (error) {
      console.error("Auth Error:", error);
      alert("Алдаа: " + getErrorMessage(error.code || error.message));
      btnSubmit.innerText = isSignUp ? "Бүртгүүлэх" : "Нэвтрэх";
      btnSubmit.disabled = false;
    }
  });
}

// Алдааны мессежийг монгол хэл рүү хөрвүүлэх функц
function getErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Энэ имэйл хаяг аль хэдийн бүртгэгдсэн байна.";
    case "auth/invalid-email":
      return "Имэйл хаяг буруу байна.";
    case "auth/weak-password":
      return "Нууц үг наад зах нь 6 тэмдэгттэй байх ёстой.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Имэйл эсвэл нууц үг буруу байна.";
    default:
      return code;
  }
}