import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  doc, getDoc, runTransaction, collection, query, where,
  onSnapshot, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const msg = $("msg");
const MIN_ROWS = 8; // printed form always shows at least this many rows
let user, profile, latestTitle = "";

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = toDateInputValue(new Date());
$("meetingDate").max = today; // meetings are logged after they happen

const say = (text, ok = false) => {
  msg.textContent = text;
  msg.style.color = ok ? "#1f7a4d" : "#c8342f";
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const prefill = () => {
  if (!$("projectTitle").value) $("projectTitle").value = latestTitle;
};

onAuthStateChanged(auth, async (u) => {
  if (!u) { location.href = "index.html"; return; }
  user = u;
  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    if (!snap.exists()) { say("Profile not found. Please register again."); return; }
    profile = snap.data();
    $("pFirst").textContent = profile.fullName.split(" ")[0];
    $("pId").textContent = profile.studentId;
    $("pProgram").textContent = profile.program;
    $("pYear").textContent = profile.year;
    $("pSupervisor").textContent = profile.supervisorName;
    $("sId").textContent = profile.studentId;
    $("sName").textContent = profile.fullName;
    $("sSupervisor").textContent = profile.supervisorName;
    $("sPrinted").textContent = new Date().toLocaleDateString("en-GB");
    listen();
  } catch (error) {
    say("Could not load your profile. Check your connection and try again.");
  }
});

// Submit or resubmit (the document ID blocks duplicates)
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
          reviewedBy: deleteField(),
          reviewedAt: deleteField(),
          comment: deleteField()
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
          resubmitCount: 0
        });
      }
    });
    say("Submitted! Waiting for your supervisor.", true);
    $("meetingDate").value = "";
    prefill();
  } catch (err) {
    say(err.message === "duplicate"
      ? "You already submitted a request for that date."
      : "Could not submit. Check your connection and try again.");
  } finally {
    $("submitBtn").disabled = false;
  }
});

// Live list (sorted here, so no Firestore index is needed)
function listen() {
  const q = query(collection(db, "requests"), where("uid", "==", user.uid));
  onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => d.data())
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
    render(items);
  }, () => say("Could not load your requests."));
}

function meetItem(r) {
  const [y, m, d] = r.meetingDate.split("-").map(Number);
  const row = el("div", "meet");

  const badge = el("div", "date-badge");
  badge.appendChild(el("div", "d", String(d)));
  badge.appendChild(el("div", "m",
    new Date(y, m - 1, d).toLocaleString("en-GB", { month: "short" })));

  const body = el("div");
  body.appendChild(el("div", "meet-title", r.projectTitle));
  let note = "Waiting for your supervisor";
  if (r.status === "approved") note = r.comment ? "Supervisor: " + r.comment : "Verified";
  if (r.status === "rejected") note = r.comment ? "Supervisor: " + r.comment : "Rejected. Fix it and resubmit.";
  body.appendChild(el("div", "meet-note", note));

  const side = el("div", "meet-side");
  const label = { approved: "✔ Verified", pending: "Pending", rejected: "Rejected" }[r.status];
  side.appendChild(el("span", "pill " + r.status, label));
  if (r.status === "rejected") {
    const b = el("button", "btn-ghost btn-sm", "Resubmit");
    b.type = "button";
    b.onclick = () => {
      $("meetingDate").value = r.meetingDate;
      $("projectTitle").value = r.projectTitle;
      window.scrollTo({ top: 0, behavior: "smooth" });
      say("Fix your title if needed, then submit again.", true);
    };
    side.appendChild(b);
  }

  row.append(badge, body, side);
  return row;
}

function render(items) {
  const list = $("list");
  list.innerHTML = "";
  $("empty").hidden = items.length > 0;
  const count = (s) => items.filter((r) => r.status === s).length;
  $("statApproved").textContent = count("approved");
  $("statPending").textContent = count("pending");
  $("statRejected").textContent = count("rejected");
  items.forEach((r) => list.appendChild(meetItem(r)));

  latestTitle = items[0] ? items[0].projectTitle : "";
  prefill();
  renderSheet(items);
}

// Keep the register chronological; the verification mark is reserved for approved meetings.
function renderSheet(items) {
  $("sTitle").textContent = latestTitle;
  const tbody = $("sRows");
  tbody.innerHTML = "";
  const meetings = [...items].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  meetings.forEach((r) => {
    const [y, m, d] = r.meetingDate.split("-");
    const tr = document.createElement("tr");
    tr.append(
      el("td", "date", `${d}/${m}/${y}`),
      el("td", "", r.comment || ""),
      el("td", "ok", r.status === "approved" ? "✔" : "")
    );
    tbody.appendChild(tr);
  });
  for (let i = meetings.length; i < MIN_ROWS; i++) {
    const tr = document.createElement("tr");
    tr.append(el("td", "date"), el("td"), el("td", "ok"));
    tbody.appendChild(tr);
  }
}

$("printBtn").onclick = () => window.print();
$("logoutBtn").onclick = async () => { await signOut(auth); location.href = "index.html"; };
