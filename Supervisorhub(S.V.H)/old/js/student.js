import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, runTransaction, collection, query, where,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");
let user, profile;

const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
$("meetingDate").max = today; // meetings are logged after they happen

const say = (text, ok = false) => {
  msg.textContent = text;
  msg.style.color = ok ? "#2e7d32" : "#c62828";
};

onAuthStateChanged(auth, async (u) => {
  if (!u) { location.href = "index.html"; return; }
  user = u;
  const snap = await getDoc(doc(db, "users", u.uid));
  if (!snap.exists()) { say("Profile not found. Please register again."); return; }
  profile = snap.data();
  $("pName").textContent = profile.fullName;
  $("pId").textContent = profile.studentId;
  $("pProgram").textContent = profile.program;
  $("pYear").textContent = profile.year;
  $("pSupervisor").textContent = profile.supervisorName;
  listen();
});

// Submit or resubmit (document ID blocks duplicates)
$("requestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const meetingDate = $("meetingDate").value;
  const projectTitle = $("projectTitle").value.trim();
  if (!meetingDate || meetingDate > today) { say("Pick a valid date (not in the future)."); return; }
  if (!projectTitle) { say("Enter your project title."); return; }

  const ref = doc(db, "requests", `${user.uid}_${meetingDate}`);
  $("submitBtn").disabled = true;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const old = snap.data();
        if (old.status !== "rejected") throw new Error("duplicate");
        tx.update(ref, {
          projectTitle,
          status: "pending",
          submittedAt: serverTimestamp(),
          resubmitCount: (old.resubmitCount || 0) + 1,
          reviewedBy: null,
          reviewedAt: null
        });
      } else {
        tx.set(ref, {
          uid: user.uid,
          fullName: profile.fullName,
          studentId: profile.studentId,
          program: profile.program,
          year: profile.year,
          supervisorId: profile.supervisorId,
          supervisorName: profile.supervisorName,
          projectTitle,
          meetingDate,
          status: "pending",
          submittedAt: serverTimestamp(),
          resubmitCount: 0,
          reviewedBy: null,
          reviewedAt: null
        });
      }
    });
    say("Submitted! Waiting for your supervisor.", true);
    $("requestForm").reset();
  } catch (err) {
    say(err.message === "duplicate"
      ? "You already submitted a request for that date."
      : "Could not submit. Check your connection and try again.");
  } finally {
    $("submitBtn").disabled = false;
  }
});

// Live list of my requests (sorted here, so no Firestore index needed)
function listen() {
  const q = query(collection(db, "requests"), where("uid", "==", user.uid));
  onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => d.data())
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
    render(items);
  }, () => say("Could not load your requests."));
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function render(items) {
  const tbody = $("rows");
  tbody.innerHTML = "";
  $("empty").hidden = items.length > 0;

  items.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.appendChild(cell(i + 1));
    tr.appendChild(cell(r.meetingDate));
    tr.appendChild(cell(r.projectTitle));

    const st = document.createElement("td");
    st.className = "st-" + r.status;
    if (r.status === "approved") st.textContent = "✔ Approved";
    else if (r.status === "rejected") {
      st.textContent = "✖ Rejected ";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ghost small no-print";
      b.textContent = "Resubmit";
      b.onclick = () => {
        $("meetingDate").value = r.meetingDate;
        $("projectTitle").value = r.projectTitle;
        window.scrollTo({ top: 0, behavior: "smooth" });
        say("Fix your title if needed, then submit again.", true);
      };
      st.appendChild(b);
    } else st.textContent = "⏳ Pending";
    tr.appendChild(st);

    tr.appendChild(cell("")); // blank space for the supervisor's real signature
    tbody.appendChild(tr);
  });
}

$("printBtn").onclick = () => window.print();
$("logoutBtn").onclick = async () => { await signOut(auth); location.href = "index.html"; };