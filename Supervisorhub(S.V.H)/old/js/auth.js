import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, getDocs, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");
let registering = false;
let supervisorNames = {}; // uid -> name

const ERRORS = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/network-request-failed": "No internet connection. Try again.",
  "auth/too-many-requests": "Too many attempts. Wait a bit and retry."
};
const showError = (e) => {
  msg.textContent = ERRORS[e.code] || "Something went wrong. Try again.";
};

// Tabs
function showTab(login) {
  $("loginForm").hidden = !login;
  $("registerForm").hidden = login;
  $("tabLogin").classList.toggle("active", login);
  $("tabRegister").classList.toggle("active", !login);
  msg.textContent = "";
}
$("tabLogin").onclick = () => showTab(true);
$("tabRegister").onclick = () => showTab(false);

// Fill the supervisor dropdown
async function loadSupervisors() {
  const sel = $("supervisor");
  try {
    const snap = await getDocs(collection(db, "supervisors"));
    sel.innerHTML = '<option value="">Select your supervisor</option>';
    snap.forEach((d) => {
      supervisorNames[d.id] = d.data().name;
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.data().name;
      sel.appendChild(o);
    });
    if (snap.empty) sel.innerHTML = '<option value="">No supervisors yet</option>';
  } catch (err) {
    sel.innerHTML = '<option value="">Could not load supervisors</option>';
  }
}
loadSupervisors();

// Supervisors go to admin page, students to student page
async function route(user) {
  const isSupervisor = (await getDoc(doc(db, "supervisors", user.uid))).exists();
  location.href = isSupervisor ? "admin.html" : "student.html";
}

// Login
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  try {
    await signInWithEmailAndPassword(
      auth, $("loginEmail").value.trim(), $("loginPassword").value
    );
  } catch (err) { showError(err); }
});

// Register
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  const supervisorId = $("supervisor").value;
  if (!supervisorId) { msg.textContent = "Please pick your supervisor."; return; }
  registering = true;
  try {
    const cred = await createUserWithEmailAndPassword(
      auth, $("regEmail").value.trim(), $("regPassword").value
    );
    await setDoc(doc(db, "users", cred.user.uid), {
      fullName: $("fullName").value.trim(),
      studentId: $("studentId").value.trim().toUpperCase(),
      program: $("program").value.trim(),
      year: Number($("year").value),
      supervisorId,
      supervisorName: supervisorNames[supervisorId],
      email: cred.user.email,
      createdAt: serverTimestamp()
    });
    await route(cred.user);
  } catch (err) {
    registering = false;
    showError(err);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && !registering) route(user);
});