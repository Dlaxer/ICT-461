// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDca_tqhLrxPuP7y-drl-6syTUi33Fro6A",
  authDomain: "supervision-register.firebaseapp.com",
  projectId: "supervision-register",
  storageBucket: "supervision-register.firebasestorage.app",
  messagingSenderId: "964653304170",
 appId: "1:964653304170:web:6601c650630a5d9d323d13",
  measurementId: "G-8BJL9SE6D8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);