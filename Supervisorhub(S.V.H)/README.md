# Supervision Register

## Local development

Install the project tools with `npm install`, then run `npm run build` to
prepare the `dist/` directory used by Firebase Hosting. `dist/` is generated
and should not be edited by hand.

The Firebase browser configuration is in `js/firebase.js`. It contains the
Firebase web app configuration, not an admin credential. Never put service
account keys or other privileged credentials in browser code.

## Firestore test setup

Rules tests use the Firestore Emulator and isolated test users and documents.
They do not connect to or alter the configured production project.

1. Install a supported Java runtime and ensure `java` is available on `PATH`.
2. Run `npm install`.
3. Run `npm test`. The Firebase CLI starts the Firestore Emulator for the test
   run and shuts it down afterward.

The test suite loads `firestore.rules` and covers profile isolation, public
supervisor dropdown reads, supervisor application isolation, request ownership,
supervisor scoping, and allowed submission/review state transitions.

## Account roles and supervisor approval

Registration offers Student and Supervisor account types. Students choose an
approved supervisor from the public dropdown. Supervisor registrations create
an immutable, private application; choosing Supervisor does not grant dashboard
access. A trusted administrator must approve the applicant by creating:

- `supervisors/{uid}`: `{ "role": "supervisor" }`
- `supervisors_public/{uid}`: `{ "name": "Supervisor display name" }`

Use the supervisor's Firebase Authentication UID as both document IDs. The
`supervisors_public` collection must contain only display names; do not copy
email addresses or other private information there. This trusted provisioning
step prevents users from granting themselves supervisor privileges.

Enable Email/Password under Firebase Console > Authentication > Sign-in method
before using login or registration. If the supervisor dropdown reports
`permission-denied`, deploy the Firestore rules so their public-list permission
is active.

## Firebase deployment

Before deploying, confirm the Firestore database edition and database ID in the
Firebase project. The web app currently targets the `(default)` database. The
Enterprise index format in `firestore.indexes.json` must not be deployed to a
Standard database without adapting it first.

After configuring and verifying the target project and rules, build with
`npm run build` and deploy only the intended Firebase resources.
