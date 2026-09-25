import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBak_J8KvoVwLW_HZPgz4lmr1SPoM07MQE",
  authDomain: "bb-elo-rank-system.firebaseapp.com",
  projectId: "bb-elo-rank-system",
  storageBucket: "bb-elo-rank-system.firebasestorage.app",
  messagingSenderId: "594065193475",
  appId: "1:594065193475:web:5f7c800cce1eb51c852c36"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);