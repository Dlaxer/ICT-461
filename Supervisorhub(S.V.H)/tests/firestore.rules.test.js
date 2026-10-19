import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

const projectId = "demo-supervision-register";
const supervisorA = "supervisor-a";
const supervisorB = "supervisor-b";
const studentA = "student-a";
const studentB = "student-b";
let testEnv;

const profileData = (uid, supervisorId = supervisorA) => ({
  fullName: `Student ${uid}`,
  studentId: `ID-${uid}`,
  program: "Computer Science",
  year: 4,
  supervisorId,
  supervisorName: supervisorId === supervisorA ? "Supervisor A" : "Supervisor B",
  email: `${uid}@example.com`,
  createdAt: serverTimestamp()
});

const requestData = (uid, supervisorId = supervisorA) => ({
  uid,
  fullName: `Student ${uid}`,
  studentId: `ID-${uid}`,
  program: "Computer Science",
  year: 4,
  supervisorId,
  supervisorName: supervisorId === supervisorA ? "Supervisor A" : "Supervisor B",
  projectTitle: "Test project",
  meetingDate: "2026-10-16",
  status: "pending",
  submittedAt: serverTimestamp(),
  resubmitCount: 0
});

async function seedSupervisor(uid, name) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "supervisors", uid), { role: "supervisor" });
    await setDoc(doc(db, "supervisors_public", uid), { name });
  });
}

async function seedRequest(uid, supervisorId = supervisorA, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "requests", `${uid}_2026-10-16`),
      { ...requestData(uid, supervisorId), ...extra }
    );
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedSupervisor(supervisorA, "Supervisor A");
  await seedSupervisor(supervisorB, "Supervisor B");
});

after(async () => {
  await testEnv.cleanup();
});

test("public dropdown can read public names, not private supervisor records", async () => {
  const unauthenticated = testEnv.unauthenticatedContext().firestore();

  const supervisors = await assertSucceeds(
    getDocs(collection(unauthenticated, "supervisors_public"))
  );
  assert.equal(supervisors.size, 2);
  await assertFails(getDoc(doc(unauthenticated, "supervisors", supervisorA)));
});

test("a signed-in user can check only their own supervisor role marker", async () => {
  const student = testEnv.authenticatedContext(studentA).firestore();
  await assertSucceeds(getDoc(doc(student, "supervisors", studentA)));
  await assertFails(getDoc(doc(student, "supervisors", supervisorA)));
  await assertFails(setDoc(doc(student, "supervisors", studentA), {
    role: "supervisor"
  }));
});

test("supervisor applications are owner-readable, immutable, and do not grant a role", async () => {
  const applicant = testEnv.authenticatedContext(studentA, {
    email: `${studentA}@example.com`
  }).firestore();
  const otherUser = testEnv.authenticatedContext(studentB, {
    email: `${studentB}@example.com`
  }).firestore();
  const applicationRef = doc(applicant, "supervisor_applications", studentA);

  await assertSucceeds(setDoc(applicationRef, {
    fullName: "Supervisor Applicant",
    email: `${studentA}@example.com`,
    submittedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(applicationRef));
  await assertFails(getDoc(doc(otherUser, "supervisor_applications", studentA)));
  await assertFails(getDocs(collection(applicant, "supervisor_applications")));
  await assertFails(updateDoc(applicationRef, { fullName: "Changed name" }));
  await assertFails(deleteDoc(applicationRef));
  await assertFails(setDoc(doc(applicant, "supervisors_public", studentA), {
    name: "Self-appointed supervisor"
  }));
});

test("profiles are owner-readable and keep supervisor assignment immutable", async () => {
  const student = testEnv.authenticatedContext(studentA, {
    email: `${studentA}@example.com`
  }).firestore();
  await assertSucceeds(setDoc(
    doc(student, "users", studentA),
    profileData(studentA)
  ));

  const secondStudent = testEnv.authenticatedContext(studentB, {
    email: `${studentB}@example.com`
  }).firestore();
  await assertFails(getDoc(doc(secondStudent, "users", studentA)));
  await assertFails(updateDoc(doc(student, "users", studentA), {
    supervisorId: supervisorB,
    supervisorName: "Supervisor B"
  }));
  await assertFails(updateDoc(doc(student, "users", studentA), {
    email: "someone-else@example.com"
  }));
});

test("student profile creation needs a public supervisor entry, not a private role marker", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), "supervisors", supervisorA));
  });

  const student = testEnv.authenticatedContext(studentA, {
    email: `${studentA}@example.com`
  }).firestore();
  await assertSucceeds(setDoc(
    doc(student, "users", studentA),
    profileData(studentA)
  ));
});

test("students can create only their own valid pending requests", async () => {
  const student = testEnv.authenticatedContext(studentA, {
    email: `${studentA}@example.com`
  }).firestore();
  await assertSucceeds(setDoc(
    doc(student, "users", studentA),
    profileData(studentA)
  ));

  await assertSucceeds(setDoc(
    doc(student, "requests", `${studentA}_2026-10-16`),
    requestData(studentA)
  ));
  await assertFails(setDoc(
    doc(student, "requests", `${studentB}_2026-10-16`),
    requestData(studentB)
  ));
  await assertFails(setDoc(
    doc(student, "requests", `${studentA}_2026-10-17`),
    { ...requestData(studentA), status: "approved" }
  ));
  await assertFails(setDoc(
    doc(student, "requests", `${studentA}_2026-10-18`),
    { ...requestData(studentA), unexpected: "extra field" }
  ));
});

test("student request queries must be scoped to their own UID", async () => {
  await seedRequest(studentA);
  await seedRequest(studentB);
  const student = testEnv.authenticatedContext(studentA).firestore();

  const ownRequests = await assertSucceeds(getDocs(query(
    collection(student, "requests"),
    where("uid", "==", studentA)
  )));
  assert.equal(ownRequests.size, 1);
  await assertFails(getDocs(collection(student, "requests")));
});

test("only the assigned supervisor can list and review their pending requests", async () => {
  await seedRequest(studentA, supervisorA);
  await seedRequest(studentB, supervisorB);
  const supervisor = testEnv.authenticatedContext(supervisorA).firestore();

  const assigned = await assertSucceeds(getDocs(query(
    collection(supervisor, "requests"),
    where("supervisorId", "==", supervisorA)
  )));
  assert.equal(assigned.size, 1);
  await assertFails(getDocs(collection(supervisor, "requests")));
  await assertFails(getDoc(doc(supervisor, "requests", `${studentB}_2026-10-16`)));

  await assertSucceeds(updateDoc(
    doc(supervisor, "requests", `${studentA}_2026-10-16`),
    {
      status: "approved",
      comment: "Reviewed",
      reviewedBy: supervisorA,
      reviewedAt: serverTimestamp()
    }
  ));
});

test("students can resubmit rejected requests but cannot review requests", async () => {
  await seedRequest(studentA, supervisorA, {
    status: "rejected",
    reviewedBy: supervisorA,
    reviewedAt: new Date(),
    comment: "Please correct this."
  });

  const student = testEnv.authenticatedContext(studentA).firestore();
  await assertSucceeds(updateDoc(
    doc(student, "requests", `${studentA}_2026-10-16`),
    {
      projectTitle: "Corrected project",
      status: "pending",
      submittedAt: serverTimestamp(),
      resubmitCount: 1,
      reviewedBy: deleteField(),
      reviewedAt: deleteField(),
      comment: deleteField()
    }
  ));
  await assertFails(updateDoc(
    doc(student, "requests", `${studentA}_2026-10-16`),
    {
      status: "approved",
      reviewedBy: studentA,
      reviewedAt: serverTimestamp()
    }
  ));
});
