  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDRpnlKoXUPGtUh8s4oGUKHF-Oaw-v_XmA",
    authDomain: "social0x.firebaseapp.com",
    projectId: "social0x",
    storageBucket: "social0x.firebasestorage.app",
    messagingSenderId: "896467977383",
    appId: "1:896467977383:web:43803d78b4d8406b220782",
    measurementId: "G-KZX9F9MJG0"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
