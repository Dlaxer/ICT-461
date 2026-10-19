import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp,
  updateDoc, where
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;
let supervisor;
let requests = [];
let stopListening;
let selectedRequest;

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day ? date : null;
}

function displayDate(value) {
  const date = dateFromValue(value);
  return date ? date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }) : "—";
}

function timestampDate(value) {
  if (!value || typeof value.toDate !== "function") return null;
  const date = value.toDate();
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function setMessage(text, isError = false) {
  const message = $("message");
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle("is-error", isError);
}

function requestAge(r) {
  const submitted = timestampDate(r.submittedAt);
  return submitted ? Date.now() - submitted.getTime() : 0;
}

function updateSummary() {
  const pending = requests.filter((r) => r.status === "pending");
  const overdue = pending.filter((r) => requestAge(r) > 2 * DAY_MS);
  const rejected = requests.filter((r) => r.status === "rejected");
  const weekStart = startOfWeek(new Date());
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const doneThisWeek = requests.filter((r) => {
    if (r.status !== "approved") return false;
    const reviewed = timestampDate(r.reviewedAt);
    return reviewed && reviewed >= weekStart && reviewed < nextWeek;
  });

  $("pendingCount").textContent = pending.length;
  $("overdueCount").textContent = overdue.length;
  $("rejectedCount").textContent = rejected.length;
  $("doneCount").textContent = doneThisWeek.length;

  const banner = $("overdueBanner");
  banner.hidden = overdue.length === 0;
  banner.textContent = overdue.length === 1
    ? "1 request has been waiting for more than 2 days."
    : `${overdue.length} requests have been waiting for more than 2 days.`;
}

function createCell(text, className, label) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text || "—";
  return cell;
}

function createStatus(status) {
  const label = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected"
  }[status] || "Unknown";
  const badge = document.createElement("span");
  badge.className = `status-badge ${status}`;
  badge.textContent = label;
  return badge;
}

function reviewButton(r) {
  const button = document.createElement("button");
  button.className = "btn btn-sm review-button";
  button.type = "button";
  button.textContent = "Review";
  button.setAttribute("aria-label", `Review ${r.fullName || "student"}'s request`);
  button.addEventListener("click", () => openReview(r));
  return button;
}

function filteredRequests() {
  const search = $("searchInput").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const from = $("dateFrom").value;
  const to = $("dateTo").value;

  return requests.filter((r) => {
    const identity = `${r.fullName || ""} ${r.studentId || ""}`.toLowerCase();
    return (!search || identity.includes(search)) &&
      (status === "all" || r.status === status) &&
      (!from || r.meetingDate >= from) &&
      (!to || r.meetingDate <= to);
  });
}

function renderRequests() {
  const rows = $("requestRows");
  rows.replaceChildren();
  const from = $("dateFrom").value;
  const to = $("dateTo").value;
  if (from && to && from > to) {
    $("filterError").textContent = "The start date must be on or before the end date.";
    $("resultCount").textContent = "—";
    $("emptyRequests").hidden = true;
    return;
  }
  $("filterError").textContent = "";

  const filtered = filteredRequests().sort((a, b) =>
    (b.meetingDate || "").localeCompare(a.meetingDate || "") ||
    (timestampDate(b.submittedAt)?.getTime() || 0) -
      (timestampDate(a.submittedAt)?.getTime() || 0));

  $("resultCount").textContent = `${filtered.length} ${filtered.length === 1 ? "request" : "requests"}`;
  $("emptyRequests").hidden = filtered.length > 0;

  filtered.forEach((r) => {
    const row = document.createElement("tr");
    row.appendChild(createCell(displayDate(r.meetingDate), "meeting-date", "Meeting date"));

    const student = document.createElement("td");
    student.className = "student-cell";
    student.dataset.label = "Student";
    const name = document.createElement("strong");
    name.textContent = r.fullName || "Unnamed student";
    const id = document.createElement("span");
    id.textContent = r.studentId || "No student ID";
    student.append(name, id);
    row.appendChild(student);

    const project = document.createElement("td");
    project.className = "project-cell";
    project.dataset.label = "Project";
    const title = document.createElement("strong");
    title.textContent = r.projectTitle || "Untitled project";
    const program = document.createElement("span");
    program.textContent = [r.program, r.year ? `Year ${r.year}` : ""].filter(Boolean).join(" · ");
    project.append(title, program);
    row.appendChild(project);

    const statusCell = document.createElement("td");
    statusCell.className = "request-status";
    statusCell.dataset.label = "Status";
    statusCell.appendChild(createStatus(r.status));
    row.appendChild(statusCell);

    const action = document.createElement("td");
    action.className = "request-action";
    action.dataset.label = "Action";
    if (r.status === "pending") action.appendChild(reviewButton(r));
    else action.textContent = "—";
    row.appendChild(action);
    rows.appendChild(row);
  });
}

function render() {
  updateSummary();
  renderRequests();
}

function openReview(r) {
  selectedRequest = r;
  $("reviewStudent").textContent = `${r.fullName || "Student"} · ${r.studentId || "No ID"} · ${displayDate(r.meetingDate)}`;
  $("reviewComment").value = "";
  $("reviewError").textContent = "";
  $("reviewDialog").showModal();
}

async function submitReview(event) {
  event.preventDefault();
  const decision = event.submitter?.value;
  if (!selectedRequest || !["approved", "rejected"].includes(decision)) return;
  const comment = $("reviewComment").value.trim();
  const buttons = [$("approveRequest"), $("rejectRequest"), $("cancelReview")];
  buttons.forEach((button) => { button.disabled = true; });
  $("reviewError").textContent = "";
  try {
    await updateDoc(doc(db, "requests", selectedRequest.id), {
      status: decision,
      comment: comment || null,
      reviewedBy: supervisor.uid,
      reviewedAt: serverTimestamp()
    });
    $("reviewDialog").close();
    setMessage(decision === "approved" ? "Request approved." : "Request rejected.");
  } catch (error) {
    $("reviewError").textContent = "Could not save the review. Check your connection and try again.";
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function getRegisterRange() {
  const chosenDate = dateFromValue($("registerDate").value);
  if (!chosenDate) return null;
  if ($("registerMode").value === "date") {
    return { start: chosenDate, end: new Date(chosenDate.getTime() + DAY_MS) };
  }
  const start = startOfWeek(chosenDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function formatRange(start, end) {
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  if (localDateValue(start) === localDateValue(lastDay)) return displayDate(localDateValue(start));
  return `${displayDate(localDateValue(start))} – ${displayDate(localDateValue(lastDay))}`;
}

function prepareRegister() {
  const range = getRegisterRange();
  if (!range) {
    $("registerDate").setCustomValidity("Choose a valid date for the register.");
    $("registerDate").reportValidity();
    return;
  }
  $("registerDate").setCustomValidity("");
  const selected = requests.filter((r) => {
    const meeting = dateFromValue(r.meetingDate);
    return meeting && meeting >= range.start && meeting < range.end;
  }).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate) ||
    (a.fullName || "").localeCompare(b.fullName || ""));

  $("printSupervisor").textContent = supervisor.name;
  $("printPeriod").textContent = formatRange(range.start, range.end);
  $("printDate").textContent = new Date().toLocaleDateString("en-GB");
  const rows = $("registerPrintRows");
  rows.replaceChildren();

  if (selected.length === 0) {
    const row = document.createElement("tr");
    const cell = createCell("No meeting requests for this period.", "no-register-rows");
    cell.colSpan = 6;
    row.appendChild(cell);
    rows.appendChild(row);
  } else {
    selected.forEach((r) => {
      const row = document.createElement("tr");
      row.append(
        createCell(displayDate(r.meetingDate)),
        createStudentPrintCell(r),
        createCell([r.program, r.year ? `Year ${r.year}` : ""].filter(Boolean).join(" · ")),
        createCell(r.projectTitle),
        createCell(r.status ? r.status[0].toUpperCase() + r.status.slice(1) : ""),
        createCell(r.comment)
      );
      rows.appendChild(row);
    });
  }
  window.print();
}

function createStudentPrintCell(request) {
  const cell = document.createElement("td");
  cell.className = "print-student";
  const name = document.createElement("strong");
  name.textContent = request.fullName || "—";
  const id = document.createElement("span");
  id.textContent = request.studentId || "—";
  cell.append(name, id);
  return cell;
}

["searchInput", "statusFilter", "dateFrom", "dateTo"].forEach((id) => {
  $(id).addEventListener(id === "searchInput" ? "input" : "change", renderRequests);
});

$("clearFilters").addEventListener("click", () => {
  $("searchInput").value = "";
  $("statusFilter").value = "all";
  $("dateFrom").value = "";
  $("dateTo").value = "";
  setMessage("");
  renderRequests();
});

$("registerMode").addEventListener("change", () => {
  $("registerDateLabel").firstChild.textContent =
    $("registerMode").value === "week" ? "Date in week" : "Meeting date";
});
$("registerDate").value = localDateValue(new Date());
$("printRegister").addEventListener("click", prepareRegister);

$("reviewForm").addEventListener("submit", submitReview);
$("cancelReview").addEventListener("click", () => $("reviewDialog").close());
$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    location.replace("index.html");
  } catch (error) {
    setMessage("Could not log out. Try again.", true);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (stopListening) {
    stopListening();
    stopListening = null;
  }
  if (!user) {
    location.replace("index.html");
    return;
  }
  try {
    const supervisorDoc = await getDoc(doc(db, "supervisors", user.uid));
    if (auth.currentUser?.uid !== user.uid) return;
    if (!supervisorDoc.exists()) {
      location.replace("student.html");
      return;
    }
    supervisor = { uid: user.uid, name: supervisorDoc.data().name || "Supervisor" };
    $("supervisorName").textContent = supervisor.name.split(/\s+/)[0];
    const requestQuery = query(
      collection(db, "requests"),
      where("supervisorId", "==", user.uid)
    );
    stopListening = onSnapshot(requestQuery, (snapshot) => {
      requests = snapshot.docs.map((requestDoc) => ({
        ...requestDoc.data(),
        id: requestDoc.id
      }));
      setMessage("");
      render();
    }, (error) => {
      setMessage("Could not load your requests. Check your access and connection.", true);
    });
  } catch (error) {
    setMessage("Could not verify your supervisor account. Try again or contact support.", true);
  }
});
