// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBgtiM3ER1pkDQEaM1jGqtnQxZqqW6gJ4o",
    authDomain: "pretzeldaily-c340a.firebaseapp.com",
    projectId: "pretzeldaily-c340a",
    storageBucket: "pretzeldaily-c340a.firebasestorage.app",
    messagingSenderId: "754918040979",
    appId: "1:754918040979:web:a3fdf590f0cd349e433466",
    measurementId: "G-QLLN5XE6R5",
    databaseURL: "https://pretzeldaily-c340a-default-rtdb.firebaseio.com"
};

// Initialize Firebase
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
  } else {
    console.warn('Firebase SDK not loaded. Using local storage fallback.');
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
  console.warn('Using local storage fallback due to Firebase initialization error.');
}
