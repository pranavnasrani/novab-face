import React, { useState, createContext, useEffect } from 'react';
import { generateMockCard, generateMockLoan, generateAccountNumber } from './constants';
import { User, Transaction, Card, Loan } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AnimatePresence, motion } from 'framer-motion';
import { WelcomeScreen } from './components/OnboardingScreen'; // Repurposed as WelcomeScreen
import { RegisterScreen } from './components/DataScreen'; // Repurposed as RegisterScreen
import { CheckCircleIcon, XCircleIcon } from './components/icons';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, runTransaction, updateDoc, deleteDoc, orderBy, limit as firestoreLimit } from 'firebase/firestore';


const base64url = {
    encode: (buffer: ArrayBuffer): string => {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    },
    decode: (str: string): ArrayBuffer => {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = str.length % 4;
        if (pad) {
            if (pad === 1) throw new Error('InvalidLengthError: Input base64url string is the wrong length to determine padding');
            str += new Array(5 - pad).join('=');
        }
        const binary_string = window.atob(str);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
};


const ToastNotification = ({ message, type }: { message: string, type: 'success' | 'error' }) => {
    const isSuccess = type === 'success';
    const Icon = isSuccess ? CheckCircleIcon : XCircleIcon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className={`fixed bottom-28 inset-x-0 mx-auto z-50 flex items-center gap-3 p-4 rounded-2xl shadow-lg text-white ${isSuccess ? 'bg-green-600' : 'bg-red-600'} w-11/12 max-w-sm`}
        >
            <Icon className="w-6 h-6 flex-shrink-0" />
            <p className="font-semibold text-sm">{message}</p>
        </motion.div>
    );
};

export interface CardApplicationDetails {
    fullName: string;
    address: string;
    dateOfBirth: string;
    employmentStatus: string;
    employer: string;
    annualIncome: number;
}

export interface LoanApplicationDetails extends CardApplicationDetails {
    loanAmount: number;
    loanTerm: number;
}

export interface Passkey {
    id: string; // The passkey credential ID, used as Firestore document ID
    created: string;
}

interface BankContextType {
    currentUser: User | null;
    users: User[]; // Will be empty now, but kept for type safety in components that might use it
    transactions: Transaction[];
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    registerUser: (name: string, username: string, pin: string, email: string, phone: string, password: string) => Promise<boolean>;
    transferMoney: (recipientIdentifier: string, amount: number) => Promise<{ success: boolean; message: string }>;
    addCardToUser: (details: CardApplicationDetails) => Promise<{ success: boolean; message: string; newCard?: Card }>;
    addLoanToUser: (details: LoanApplicationDetails) => Promise<{ success: boolean; message: string; newLoan?: Loan }>;
    requestPaymentExtension: (accountId: string, type: 'card' | 'loan') => Promise<{ success: boolean; message: string; newDueDate?: string }>;
    makeAccountPayment: (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number) => Promise<{ success: boolean; message: string }>;
    showToast: (message: string, type: 'success' | 'error') => void;
    isPasskeySupported: boolean;
    passkeys: Passkey[];
    registerPasskey: () => Promise<void>;
    loginWithPasskey: () => Promise<boolean>;
    removePasskey: (passkeyId: string) => Promise<void>;
    verifyCurrentUserWithPasskey: () => Promise<boolean>;
}

export const BankContext = createContext<BankContextType>(null!);

type AuthScreen = 'welcome' | 'login' | 'register';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isPasskeySupported, setIsPasskeySupported] = useState(false);
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const loadUserAndData = async (uid: string) => {
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as Omit<User, 'uid' | 'cards' | 'loans'>;
            
            const cardsQuery = query(collection(db, `users/${uid}/cards`));
            const loansQuery = query(collection(db, `users/${uid}/loans`));
            const passkeysQuery = query(collection(db, `users/${uid}/passkeys`));
            const transactionsQuery = query(collection(db, "transactions"), where("uid", "==", uid), orderBy("timestamp", "desc"), firestoreLimit(20));

            const [cardDocs, loanDocs, passkeyDocs, transactionDocs] = await Promise.all([
                getDocs(cardsQuery),
                getDocs(loansQuery),
                getDocs(passkeysQuery),
                getDocs(transactionsQuery),
            ]);

            const cards = cardDocs.docs.map(d => d.data() as Card);
            const loans = loanDocs.docs.map(d => d.data() as Loan);
            const passkeys = passkeyDocs.docs.map(d => ({ id: d.id, ...d.data() } as Passkey));
            const transactions = transactionDocs.docs.map(d => d.data() as Transaction);

            setCurrentUser({ uid, ...userData, cards, loans });
            setPasskeys(passkeys);
            setTransactions(transactions);
        } else {
            signOut(auth);
        }
    };


    useEffect(() => {
        const supported = !!(navigator.credentials && navigator.credentials.create && window.PublicKeyCredential);
        setIsPasskeySupported(supported);

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setIsLoading(true);
            if (firebaseUser) {
                await loadUserAndData(firebaseUser.uid);
            } else {
                setCurrentUser(null);
                setTransactions([]);
                setPasskeys([]);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000);
    };

    const login = async (username: string, password: string): Promise<boolean> => {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username.toLowerCase()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return false;
        }
        
        const userDoc = querySnapshot.docs[0].data();
        const email = userDoc.email;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            return true;
        } catch (error) {
            console.error("Firebase login error:", error);
            return false;
        }
    };

    const logout = () => {
        signOut(auth);
        setAuthScreen('welcome');
    };

    const registerUser = async (name: string, username: string, pin: string, email: string, phone: string, password: string): Promise<boolean> => {
        const usernameQuery = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
        const usernameSnap = await getDocs(usernameQuery);
        if (!usernameSnap.empty) {
            return false;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            const newUser: Omit<User, 'uid' | 'cards' | 'loans'> = {
                name,
                username: username.toLowerCase(),
                email,
                phone,
                pin,
                balance: 1000,
                savingsAccountNumber: generateAccountNumber(),
                avatarUrl: `https://picsum.photos/seed/${username}/100`,
            };

            await setDoc(doc(db, "users", firebaseUser.uid), newUser);
            
            const newCard = generateMockCard();
            await setDoc(doc(db, `users/${firebaseUser.uid}/cards`, newCard.cardNumber), newCard);
            
            await signOut(auth);
            
            return true;
        } catch (error) {
            console.error("Firebase registration error:", error);
            showToast("Registration failed. " + (error as Error).message, 'error');
            return false;
        }
    };

    const transferMoney = async (recipientIdentifier: string, amount: number): Promise<{ success: boolean; message: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        if (amount <= 0) return { success: false, message: 'Error: Payment amount must be positive.' };
        if (currentUser.balance < amount) return { success: false, message: `Error: Insufficient funds.` };
    
        const usersRef = collection(db, "users");
        const q1 = query(usersRef, where("name", "==", recipientIdentifier));
        const q2 = query(usersRef, where("savingsAccountNumber", "==", recipientIdentifier));
        const q3 = query(usersRef, where("email", "==", recipientIdentifier));
        const q4 = query(usersRef, where("phone", "==", recipientIdentifier));
        const q5 = query(usersRef, where("username", "==", recipientIdentifier.toLowerCase()));
    
        const results = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3), getDocs(q4), getDocs(q5)]);
        const recipientDoc = results.flatMap(snap => snap.docs)[0];
    
        if (!recipientDoc) return { success: false, message: `Error: Contact or account "${recipientIdentifier}" not found.` };
        
        const recipient = { uid: recipientDoc.id, ...recipientDoc.data() } as User;
        if (recipient.uid === currentUser.uid) return { success: false, message: 'Error: Cannot send money to yourself.' };
    
        const senderRef = doc(db, "users", currentUser.uid);
        const recipientRef = doc(db, "users", recipient.uid);
    
        try {
            await runTransaction(db, async (transaction) => {
                const senderDoc = await transaction.get(senderRef);
                if (!senderDoc.exists() || senderDoc.data().balance < amount) {
                    throw new Error("Insufficient funds.");
                }
    
                transaction.update(senderRef, { balance: senderDoc.data().balance - amount });
                transaction.update(recipientRef, { balance: recipient.balance + amount });
            });
    
            const timestamp = new Date().toISOString();
            const transactionsRef = collection(db, "transactions");
    
            await addDoc(transactionsRef, {
                uid: currentUser.uid, type: 'debit', amount, description: `Payment to ${recipient.name}`, timestamp, partyName: recipient.name, category: 'Transfers',
            });
            await addDoc(transactionsRef, {
                uid: recipient.uid, type: 'credit', amount, description: `Payment from ${currentUser.name}`, timestamp, partyName: currentUser.name, category: 'Transfers',
            });
            
            setCurrentUser(prev => prev ? ({ ...prev, balance: prev.balance - amount }) : null);
    
            return { success: true, message: `Success! You sent ${formatCurrency(amount)} to ${recipient.name}.` };
        } catch (e) {
            console.error("Transaction failed: ", e);
            return { success: false, message: (e as Error).message };
        }
    };
    
    const addCardToUser = async (details: CardApplicationDetails): Promise<{ success: boolean; message: string; newCard?: Card }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        if (Math.random() < 0.2) { // 20% rejection rate
             return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your credit card application at this time.` };
        }

        const newCard = generateMockCard();
        await setDoc(doc(db, `users/${currentUser.uid}/cards`, newCard.cardNumber), newCard);
        
        setCurrentUser(prev => prev ? ({ ...prev, cards: [...prev.cards, newCard] }) : null);

        return { success: true, message: `Congratulations, ${details.fullName}! Your new ${newCard.cardType} card has been approved.`, newCard };
    };

    const addLoanToUser = async (details: LoanApplicationDetails): Promise<{ success: boolean; message: string; newLoan?: Loan }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        
        if (Math.random() < 0.3) { // 30% rejection rate
            return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your loan application for ${formatCurrency(details.loanAmount)} at this time.` };
        }

        const { loanAmount, loanTerm } = details;
        const interestRate = parseFloat((Math.random() * 10 + 3).toFixed(2));
        const monthlyInterestRate = interestRate / 100 / 12;
        const monthlyPayment = (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTerm)) / (Math.pow(1 + monthlyInterestRate, loanTerm) - 1);
        
        const newLoan: Loan = {
            id: `loan-${currentUser.uid}-${Date.now()}`, uid: currentUser.uid, loanAmount, interestRate, termMonths: loanTerm,
            monthlyPayment: parseFloat(monthlyPayment.toFixed(2)), remainingBalance: loanAmount, status: 'Active',
            startDate: new Date().toISOString(), paymentDueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        };

        const userRef = doc(db, "users", currentUser.uid);
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User not found!";
            const newBalance = userDoc.data().balance + loanAmount;
            transaction.update(userRef, { balance: newBalance });
        });
        await setDoc(doc(db, `users/${currentUser.uid}/loans`, newLoan.id), newLoan);
        
        setCurrentUser(prev => prev ? ({ ...prev, balance: prev.balance + loanAmount, loans: [...prev.loans, newLoan] }) : null);

        return { success: true, message: `Congratulations! Your loan for ${formatCurrency(loanAmount)} has been approved.`, newLoan };
    };

    const requestPaymentExtension = async (accountId: string, type: 'card' | 'loan'): Promise<{ success: boolean; message: string; newDueDate?: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        
        if (Math.random() < 0.1) {
             return { success: false, message: `We're sorry, but we were unable to process a payment extension for this account.` };
        }
        
        let docRef;
        let originalDueDate: Date;
        if (type === 'card') {
            const card = currentUser.cards.find(c => c.cardNumber.slice(-4) === accountId);
            if (!card) return { success: false, message: `Error: Card ending in ${accountId} not found.`};
            docRef = doc(db, `users/${currentUser.uid}/cards`, card.cardNumber);
            originalDueDate = new Date(card.paymentDueDate);
        } else {
            const loan = currentUser.loans.find(l => l.id === accountId);
            if (!loan) return { success: false, message: `Error: Loan with ID ${accountId} not found.`};
            docRef = doc(db, `users/${currentUser.uid}/loans`, loan.id);
            originalDueDate = new Date(loan.paymentDueDate);
        }

        const newDueDate = new Date(originalDueDate.setDate(originalDueDate.getDate() + 14));
        await updateDoc(docRef, { paymentDueDate: newDueDate.toISOString() });
        
        const formattedDate = newDueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return { success: true, message: `Success! Your payment due date has been extended to ${formattedDate}.`, newDueDate: newDueDate.toISOString() };
    };

    const makeAccountPayment = async (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number): Promise<{ success: boolean; message: string }> => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        let paymentAmount = 0;
        let message = '';

        const userRef = doc(db, "users", currentUser.uid);

        try {
            await runTransaction(db, async (t) => {
                const userDoc = await t.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found.");
                const userData = userDoc.data();
                
                if (accountType === 'card') {
                    const card = currentUser.cards.find(c => c.cardNumber.slice(-4) === accountId);
                    if (!card) throw new Error(`Card ending in ${accountId} not found.`);
                    
                    switch(paymentType) {
                        case 'minimum': paymentAmount = card.minimumPayment; break;
                        case 'statement': paymentAmount = card.statementBalance; break;
                        case 'full': paymentAmount = card.creditBalance; break;
                        case 'custom': paymentAmount = customAmount || 0; break;
                    }
                    if (paymentAmount <= 0) throw new Error("A valid payment amount is required.");
                    if (userData.balance < paymentAmount) throw new Error("Insufficient funds.");

                    const cardRef = doc(db, `users/${currentUser.uid}/cards`, card.cardNumber);
                    t.update(userRef, { balance: userData.balance - paymentAmount });
                    t.update(cardRef, { 
                        creditBalance: Math.max(0, card.creditBalance - paymentAmount),
                        statementBalance: Math.max(0, card.statementBalance - paymentAmount)
                    });
                    message = `Successfully paid ${formatCurrency(paymentAmount)} towards your card ending in ${accountId}.`;

                } else { // Loan
                    const loan = currentUser.loans.find(l => l.id === accountId);
                    if (!loan) throw new Error(`Loan with ID ${accountId} not found.`);

                    switch(paymentType) {
                        case 'minimum': paymentAmount = loan.monthlyPayment; break;
                        case 'full': paymentAmount = loan.remainingBalance; break;
                        case 'custom': paymentAmount = customAmount || 0; break;
                        default: paymentAmount = loan.monthlyPayment; break;
                    }
                    if (paymentAmount <= 0) throw new Error("A valid payment amount is required.");
                    if (paymentAmount > loan.remainingBalance) paymentAmount = loan.remainingBalance;
                    if (userData.balance < paymentAmount) throw new Error("Insufficient funds.");

                    const loanRef = doc(db, `users/${currentUser.uid}/loans`, loan.id);
                    const newRemainingBalance = loan.remainingBalance - paymentAmount;

                    t.update(userRef, { balance: userData.balance - paymentAmount });
                    t.update(loanRef, { remainingBalance: newRemainingBalance });

                    if (newRemainingBalance <= 0) {
                        t.update(loanRef, { status: 'Paid Off' });
                        message = `Successfully paid off your loan (${accountId}). Congratulations!`;
                    } else {
                        message = `Successfully paid ${formatCurrency(paymentAmount)} towards your loan (${accountId}).`;
                    }
                }
            });

            return { success: true, message };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    };
    
    const registerPasskey = async () => {
        if (!currentUser || !isPasskeySupported) return;

        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const userHandle = new TextEncoder().encode(currentUser.username);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge, rp: { name: "Nova Bank", id: window.location.hostname },
                    user: { id: userHandle, name: currentUser.email, displayName: currentUser.name },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: { residentKey: "required", userVerification: "required" },
                    timeout: 60000,
                },
            });

            if (credential && 'rawId' in credential) {
                const newPasskeyId = base64url.encode((credential as any).rawId);
                const newPasskey: Omit<Passkey, 'id'> = { created: new Date().toISOString() };
                
                await setDoc(doc(db, `users/${currentUser.uid}/passkeys`, newPasskeyId), newPasskey);
                setPasskeys(prev => [...prev, {id: newPasskeyId, ...newPasskey}]);
                showToast("Passkey created successfully!", 'success');
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to create passkey.", 'error');
        }
    };
    
    const loginWithPasskey = async (): Promise<boolean> => {
        if (!isPasskeySupported) return false;

        setIsLoading(true);
        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
                publicKey: { challenge, userVerification: 'required', timeout: 60000 },
            });

            if (assertion && (assertion as any).response.userHandle) {
                const username = new TextDecoder().decode((assertion as any).response.userHandle);
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("username", "==", username.toLowerCase()));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) { showToast("Passkey not recognized.", 'error'); return false; }
                
                const userDoc = querySnapshot.docs[0];
                const uid = userDoc.id;
                const credentialId = base64url.encode((assertion as any).rawId);

                const passkeyDoc = await getDoc(doc(db, `users/${uid}/passkeys`, credentialId));
                if (passkeyDoc.exists()) {
                    await loadUserAndData(uid);
                    return true;
                }
            }
            showToast("Passkey not recognized.", 'error');
            return false;
        } catch (err) {
            if ((err as Error).name !== 'NotAllowedError' && (err as Error).name !== 'AbortError') {
                showToast("Passkey login failed.", 'error');
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    };
    
    const verifyCurrentUserWithPasskey = async (): Promise<boolean> => {
        if (!currentUser || !isPasskeySupported || passkeys.length === 0) return false;

        try {
            const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    allowCredentials: passkeys.map(pk => ({ id: base64url.decode(pk.id), type: 'public-key' })),
                    userVerification: 'required', timeout: 60000,
                },
            });
            return !!assertion;
        } catch (err) {
            if ((err as Error).name !== 'NotAllowedError' && (err as Error).name !== 'AbortError') {
                showToast("Passkey verification failed.", 'error');
            }
            return false;
        }
    };
    
    const removePasskey = async (passkeyId: string) => {
        if (!currentUser) return;
        await deleteDoc(doc(db, `users/${currentUser.uid}/passkeys`, passkeyId));
        setPasskeys(prev => prev.filter(p => p.id !== passkeyId));
        showToast("Passkey removed.", 'success');
    };

    const contextValue = { currentUser, users: [], transactions, login, logout, registerUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, showToast, isPasskeySupported, passkeys, registerPasskey, loginWithPasskey, removePasskey, verifyCurrentUserWithPasskey };

    const screenKey = currentUser ? 'dashboard' : authScreen;

    if (isLoading) {
        return <div className="min-h-screen w-full bg-slate-900" />;
    }
    
    const renderAuthScreen = () => {
        switch(authScreen) {
            case 'login':
                return <LoginScreen onLogin={login} onBack={() => setAuthScreen('welcome')} />;
            case 'register':
                return <RegisterScreen 
                    onRegister={registerUser} 
                    onBack={() => setAuthScreen('welcome')}
                    onRegisterSuccess={() => {
                        showToast("Account created successfully! Please log in.", 'success');
                        setAuthScreen('login');
                    }}
                />;
            case 'welcome':
            default:
                return <WelcomeScreen onNavigateToLogin={() => setAuthScreen('login')} onNavigateToRegister={() => setAuthScreen('register')} />;
        }
    }

    return (
        <BankContext.Provider value={contextValue}>
            <AnimatePresence>
                {toast && <ToastNotification message={toast.message} type={toast.type} />}
            </AnimatePresence>
            <AnimatePresence mode="wait">
                <motion.div
                    key={screenKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                >
                    {currentUser ? <Dashboard /> : renderAuthScreen() }
                </motion.div>
            </AnimatePresence>
        </BankContext.Provider>
    );
}