import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  initializeFirestore
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDca_tqhLrxPuP7y-drl-6syTUi33Fro6A",
  authDomain: "supervision-register.firebaseapp.com",
  projectId: "supervision-register",
  storageBucket: "supervision-register.firebasestorage.app",
  messagingSenderId: "964653304170",
  appId: "1:964653304170:web:6601c650630a5d9d323d13",
  measurementId: "G-8BJL9SE6D8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, "(default)");

export { app, auth, db };