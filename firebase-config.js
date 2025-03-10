// Your Firebase configuration
// Replace with your actual Firebase project credentials
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  
  // Initialize Firebase
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
  } else {
    console.warn('Firebase SDK not loaded. Using local storage fallback.');
  }