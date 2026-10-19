import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, getDocs, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");
let registering = false;
let supervisorNames = Object.create(null); // uid -> name

const ERRORS = {
  "auth/configuration-not-found": "Firebase Authentication is not configured for this project. Enable Email/Password in Firebase Console under Authentication > Sign-in method.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/network-request-failed": "No internet connection. Try again.",
  "auth/too-many-requests": "Too many attempts. Wait a bit and retry."
};
const showError = (e) => {
  const code = e?.code || "unknown";
  console.error("Authentication or account setup failed:", code, e);
  msg.textContent = ERRORS[code] || `Could not complete the request (${code}). Check the browser console for details.`;
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

function setAccountRoleFields() {
  const isStudent = $("accountRole").value === "student";
  $("studentFields").hidden = !isStudent;
  for (const id of ["studentId", "year", "program", "supervisor"]) {
    $(id).required = isStudent;
  }
}
$("accountRole").addEventListener("change", setAccountRoleFields);
setAccountRoleFields();

function restoreAuthForms() {
  $("pendingPanel").hidden = true;
  $("authTabs").hidden = false;
  $("authSub").textContent = "Log in or create your account.";
  showTab(true);
}

function showPendingApproval() {
  $("authTabs").hidden = true;
  $("loginForm").hidden = true;
  $("registerForm").hidden = true;
  $("authSub").textContent = "Supervisor application";
  $("pendingPanel").hidden = false;
  msg.textContent = "";
}
$("signOut").addEventListener("click", async () => {
  try {
    await signOut(auth);
    restoreAuthForms();
  } catch (err) {
    showError(err);
  }
});

// Fill the supervisor dropdown
async function loadSupervisors() {
  const sel = $("supervisor");
  try {
    const snap = await getDocs(collection(db, "supervisors_public"));
    supervisorNames = Object.create(null);
    sel.innerHTML = '<option value="">Select your supervisor</option>';
    snap.forEach((d) => {
      const name = d.data().name;
      if (typeof name !== "string" || !name.trim()) return;
      supervisorNames[d.id] = name.trim();
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = name.trim();
      sel.appendChild(o);
    });
    if (sel.options.length === 1) sel.innerHTML = '<option value="">No supervisors yet</option>';
  } catch (err) {
    sel.innerHTML = '<option value="">Could not load supervisors</option>';
    const code = err?.code || "unknown";
    console.error("Could not load supervisors_public:", code, err);
    msg.textContent = code === "permission-denied"
      ? "Supervisor list access was denied. The deployed Firestore rules must allow public reads of supervisors_public."
      : `Could not load the supervisor list (${code}). Check the browser console and Firestore connection.`;
  }
}
loadSupervisors();

// Only trusted supervisor records grant dashboard access; self-registrations stay pending.
async function route(user) {
  try {
    const supervisor = await getDoc(doc(db, "supervisors", user.uid));
    if (supervisor.exists()) {
      location.href = "admin.html";
      return;
    }

    const application = await getDoc(doc(db, "supervisor_applications", user.uid));
    if (application.exists()) {
      showPendingApproval();
      return;
    }

    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists()) {
      location.href = "student.html";
      return;
    }

    msg.textContent = "Your account has no student profile or supervisor application. Contact an administrator for help.";
  } catch (err) {
    showError(err);
  }
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
  const role = $("accountRole").value;
  const supervisorId = $("supervisor").value;
  if (role === "student" && (!supervisorId || !supervisorNames[supervisorId])) {
    msg.textContent = "Please choose a valid supervisor from the list.";
    return;
  }
  registering = true;
  try {
    const cred = await createUserWithEmailAndPassword(
      auth, $("regEmail").value.trim(), $("regPassword").value
    );
    if (role === "supervisor") {
      await setDoc(doc(db, "supervisor_applications", cred.user.uid), {
        fullName: $("fullName").value.trim(),
        email: cred.user.email,
        submittedAt: serverTimestamp()
      });
    } else {
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
    }
    await route(cred.user);
    registering = false;
  } catch (err) {
    registering = false;
    showError(err);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && !registering) void route(user);
});
