
// FIX: Use Firebase v9 compat libraries to enable v8 syntax. This resolves type errors where properties like 'apps', 'auth', and 'firestore' were not found on the core 'firebase' import.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export Firebase services
export const auth = firebase.auth();
export const db = firebase.firestore();