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

let isSignUp = false;

const toggleBtn = document.getElementById("toggle-btn");
const formTitle = document.getElementById("form-title");
const signupFields = document.getElementById("signup-fields");
const btnSubmit = document.getElementById("btn-submit");

// 1. Нэвтрэх / Бүртгүүлэх горим шилжүүлэх
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    isSignUp = !isSignUp;
    formTitle.innerText = isSignUp ? "CREATE ACCOUNT" : "FACEIT LOGIN";
    signupFields.style.display = isSignUp ? "block" : "none";
    btnSubmit.innerText = isSignUp ? "Бүртгүүлэх" : "Нэвтрэх";
    toggleBtn.innerText = isSignUp ? "Бүртгэлтэй юу? Нэвтрэх" : "Шинээр бүртгүүлэх";
  });
}

// 2. Нэвтрэх эсвэл Бүртгүүлэх үйлдэл
if (btnSubmit) {
  btnSubmit.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Имэйл болон нууц үгээ бүрэн оруулна уу!");
      return;
    }

    try {
      if (isSignUp) {
        const ign = document.getElementById("ign").value.trim();
        const mlbbId = document.getElementById("mlbb-id").value.trim();
        const zoneId = document.getElementById("zone-id").value.trim();

        if (!ign || !mlbbId || !zoneId) {
          alert("Тоглоомын нэр, MLBB ID болон Server ID-г бүрэн оруулна уу!");
          return;
        }

        btnSubmit.innerText = "Бүртгэж байна...";
        btnSubmit.disabled = true;

        // MLBB ID системд өмнө нь бүртгэгдсэн эсэхийг шалгах
        const q = query(
          collection(db, "users"), 
          where("mlbb_id", "==", mlbbId), 
          where("zone_id", "==", zoneId)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          alert("Энэ MLBB ID системд аль хэдийн бүртгэгдсэн байна!");
          btnSubmit.innerText = "Бүртгүүлэх";
          btnSubmit.disabled = false;
          return;
        }

        // Firebase Auth дээр хэрэглэгч үүсгэх
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firestore дээр мэдээллийг хадгалах
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: email,
          ign: ign,
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

        alert(`Амжилттай бүртгэгдлээ! Тавтай морил, ${ign}`);
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