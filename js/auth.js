import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let isSignUp = false;

const toggleBtn = document.getElementById("toggle-btn");
const formTitle = document.getElementById("form-title");
const btnSubmit = document.getElementById("btn-submit");
const errorBox = document.getElementById("error-box");

toggleBtn.addEventListener("click", () => {
  isSignUp = !isSignUp;
  formTitle.innerText = isSignUp ? "CREATE ACCOUNT" : "FACEIT LOGIN";
  btnSubmit.innerText = isSignUp ? "Бүртгүүлэх" : "Нэвтрэх";
  toggleBtn.innerText = isSignUp ? "Бүртгэлтэй юу? Нэвтрэх" : "Шинээр бүртгүүлэх";
  errorBox.style.display = "none";
});

function showError(msg) {
  errorBox.innerText = msg;
  errorBox.style.display = "block";
}

btnSubmit.addEventListener("click", async (e) => {
  e.preventDefault();
  errorBox.style.display = "none";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showError("Имэйл болон нууц үгээ бүрэн оруулна уу!");
    return;
  }

  if (password.length < 6) {
    showError("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");
    return;
  }

  btnSubmit.disabled = true;
  const originalText = btnSubmit.innerText;
  btnSubmit.innerText = isSignUp ? "Бүртгэж байна..." : "Нэвтэрч байна...";

  try {
    if (isSignUp) {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email,
        ign: email.split("@")[0],
        mlbb_id: "",
        zone_id: "",
        elo: 1000,
        level: 3,
        stats: { matches: 0, wins: 0, losses: 0, mvp_count: 0 },
        created_at: new Date().toISOString()
      });

      window.location.replace("dashboard.html");

    } else {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.replace("dashboard.html");
    }

  } catch (error) {
    console.error("Auth Error:", error);
    showError(getErrorMessage(error.code || error.message));
    btnSubmit.innerText = originalText;
    btnSubmit.disabled = false;
  }
});

function getErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use": return "Энэ имэйл хаяг аль хэдийн бүртгэгдсэн байна.";
    case "auth/invalid-email": return "Имэйл хаяг буруу байна.";
    case "auth/weak-password": return "Нууц үг наад зах нь 6 тэмдэгттэй байх ёстой.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Имэйл эсвэл нууц үг буруу байна.";
    case "auth/too-many-requests": return "Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.";
    default: return "Алдаа гарлаа: " + code;
  }
}