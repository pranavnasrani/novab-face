import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmFUIS0DnkK1hxNthcPTpblwAFg1WuHJw",
  authDomain: "nova-bank-83d23.firebaseapp.com",
  projectId: "nova-bank-83d23",
  storageBucket: "nova-bank-83d23.firebasestorage.app",
  messagingSenderId: "545942112041",
  appId: "1:545942112041:web:dcb204212f903b858e5938",
  measurementId: "G-GHBYCJ3ZYW"
};


// Initialize Firebase
// FIX: Switched to Firebase v8 syntax to match the project's likely dependency version, resolving module export errors.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export Firebase services
export const auth = firebase.auth();
export const db = firebase.firestore();
