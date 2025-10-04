import React, { useState, createContext, useEffect } from 'react';
import { MOCK_USERS, MOCK_TRANSACTIONS, generateMockCard, generateMockLoan, generateAccountNumber } from './constants';
import { User, Transaction, Card, Loan } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AnimatePresence, motion } from 'framer-motion';
import { WelcomeScreen } from './components/OnboardingScreen'; // Repurposed as WelcomeScreen
import { RegisterScreen } from './components/DataScreen'; // Repurposed as RegisterScreen
import { CheckCircleIcon, XCircleIcon } from './components/icons';

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
            className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-4 rounded-2xl shadow-lg text-white ${isSuccess ? 'bg-green-600' : 'bg-red-600'} max-w-sm w-full`}
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
    id: string;
    created: string;
}

interface BankContextType {
    currentUser: User | null;
    users: User[];
    transactions: Transaction[];
    login: (username: string, pin: string) => boolean;
    logout: () => void;
    registerUser: (name: string, username: string, pin: string, email: string, phone: string) => boolean;
    transferMoney: (recipientIdentifier: string, amount: number) => { success: boolean; message: string };
    addCardToUser: (details: CardApplicationDetails) => { success: boolean; message: string; newCard?: Card };
    addLoanToUser: (details: LoanApplicationDetails) => { success: boolean; message: string; newLoan?: Loan };
    requestPaymentExtension: (accountId: string, type: 'card' | 'loan') => { success: boolean; message: string; newDueDate?: string };
    makeAccountPayment: (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number) => { success: boolean; message: string };
    showToast: (message: string, type: 'success' | 'error') => void;
    isPasskeySupported: boolean;
    passkeys: Passkey[];
    registerPasskey: () => Promise<void>;
    loginWithPasskey: () => Promise<boolean>;
    removePasskey: (passkeyId: string) => void;
    verifyCurrentUserWithPasskey: () => Promise<boolean>;
}

export const BankContext = createContext<BankContextType>(null!);

const initialUsers = (): User[] => {
    try {
        const saved = localStorage.getItem('gemini-bank-users');
        return saved ? JSON.parse(saved) : MOCK_USERS;
    } catch (e) {
        console.error("Failed to load users, falling back to mock data.", e);
        return MOCK_USERS;
    }
};

const initialTransactions = (): Transaction[] => {
    try {
        const saved = localStorage.getItem('gemini-bank-transactions');
        return saved ? JSON.parse(saved) : MOCK_TRANSACTIONS;
    } catch (e) {
        console.error("Failed to load transactions, falling back to mock data.", e);
        return MOCK_TRANSACTIONS;
    }
};

type AuthScreen = 'welcome' | 'login' | 'register';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function App() {
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isPasskeySupported, setIsPasskeySupported] = useState(false);
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);


    useEffect(() => {
        localStorage.setItem('gemini-bank-users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        localStorage.setItem('gemini-bank-transactions', JSON.stringify(transactions));
    }, [transactions]);
    
    useEffect(() => {
        // Check for WebAuthn support
        const supported = !!(navigator.credentials && navigator.credentials.create && window.PublicKeyCredential);
        setIsPasskeySupported(supported);
    }, []);

    useEffect(() => {
        // Load passkeys for the current user
        if (currentUser && isPasskeySupported) {
            const allPasskeys = JSON.parse(localStorage.getItem('gemini-bank-passkeys') || '{}');
            setPasskeys(allPasskeys[currentUser.username] || []);
        } else {
            setPasskeys([]);
        }
    }, [currentUser, isPasskeySupported]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000); // 4 seconds
    };


    const login = (username: string, pin: string): boolean => {
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.pin === pin);
        if (user) {
            setCurrentUser(user);
            return true;
        }
        return false;
    };

    const logout = () => {
        setCurrentUser(null);
        setAuthScreen('welcome');
    };

    const registerUser = (name: string, username: string, pin: string, email: string, phone: string): boolean => {
        const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (existingUser) {
            return false; // Username taken
        }

        const newUser: User = {
            id: users.length + 1,
            name,
            username,
            pin,
            email,
            phone,
            balance: 1000, // Starting balance
            savingsAccountNumber: generateAccountNumber(),
            avatarUrl: `https://picsum.photos/seed/${username}/100`,
            cards: [generateMockCard()],
            loans: [],
        };

        const updatedUsers = [...users, newUser];
        setUsers(updatedUsers);
        setCurrentUser(newUser); // Auto-login after registration
        return true;
    }

    const transferMoney = (recipientIdentifier: string, amount: number): { success: boolean; message: string } => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        if (amount <= 0) return { success: false, message: 'Error: Payment amount must be positive.' };

        const senderIndex = users.findIndex(u => u.id === currentUser.id);
        
        const recipientIndex = users.findIndex(u =>
            u.name.toLowerCase() === recipientIdentifier.toLowerCase() ||
            u.name.split(' ')[0].toLowerCase() === recipientIdentifier.toLowerCase() ||
            u.savingsAccountNumber === recipientIdentifier ||
            u.email.toLowerCase() === recipientIdentifier.toLowerCase() ||
            u.phone.replace(/[^0-9]/g, '') === recipientIdentifier.replace(/[^0-9]/g, '')
        );

        if (recipientIndex === -1) return { success: false, message: `Error: Contact or account "${recipientIdentifier}" not found.` };
        
        const sender = users[senderIndex];
        const recipient = users[recipientIndex];

        if (sender.id === recipient.id) return { success: false, message: 'Error: Cannot send money to yourself.' };
        if (sender.balance < amount) return { success: false, message: `Error: Insufficient funds. Your balance is $${sender.balance.toFixed(2)}.` };

        const newUsers = [...users];
        newUsers[senderIndex] = { ...sender, balance: sender.balance - amount };
        newUsers[recipientIndex] = { ...recipient, balance: recipient.balance + amount };
        setUsers(newUsers);
        setCurrentUser(newUsers[senderIndex]);

        const newTransactionId = `t${transactions.length + 1}`;
        const timestamp = new Date().toISOString();

        const senderTransaction: Transaction = {
            id: newTransactionId,
            userId: sender.id,
            type: 'debit',
            amount,
            description: `Payment to ${recipient.name}`,
            timestamp,
            partyName: recipient.name,
            category: 'Transfers',
        };
        const recipientTransaction: Transaction = {
            id: `${newTransactionId}-r`,
            userId: recipient.id,
            type: 'credit',
            amount,
            description: `Payment from ${sender.name}`,
            timestamp,
            partyName: sender.name,
            category: 'Transfers',
        };

        setTransactions(prev => [...prev, senderTransaction, recipientTransaction]);

        return { success: true, message: `Success! You sent $${amount.toFixed(2)} to ${recipient.name}.` };
    };
    
    const addCardToUser = (details: CardApplicationDetails): { success: boolean; message: string; newCard?: Card } => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex === -1) return { success: false, message: 'Error: Current user not found.' };

        if (Math.random() < 0.2) { // 20% rejection rate
             return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your credit card application at this time.` };
        }

        const newCard = generateMockCard();
        const updatedUser = {
            ...users[userIndex],
            cards: [...users[userIndex].cards, newCard],
        };

        const newUsers = [...users];
        newUsers[userIndex] = updatedUser;
        setUsers(newUsers);
        setCurrentUser(updatedUser);

        return { success: true, message: `Congratulations, ${details.fullName}! Your new ${newCard.cardType} card has been approved.` };
    };

    const addLoanToUser = (details: LoanApplicationDetails): { success: boolean; message: string; newLoan?: Loan } => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex === -1) return { success: false, message: 'Error: Current user not found.' };
        
        if (Math.random() < 0.3) { // 30% rejection rate
            return { success: false, message: `We're sorry, ${details.fullName}, but we were unable to approve your loan application for ${details.loanAmount} at this time.` };
        }

        const { loanAmount, loanTerm } = details;
        const interestRate = parseFloat((Math.random() * 10 + 3).toFixed(2)); // 3% to 13%
        const monthlyInterestRate = interestRate / 100 / 12;
        const monthlyPayment = (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTerm)) / (Math.pow(1 + monthlyInterestRate, loanTerm) - 1);
        
        const today = new Date();
        const paymentDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString(); // 1st of next month

        const newLoan: Loan = {
            id: `loan-${currentUser.id}-${Date.now()}`,
            userId: currentUser.id,
            loanAmount,
            interestRate,
            termMonths: loanTerm,
            monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
            remainingBalance: loanAmount,
            status: 'Active',
            startDate: new Date().toISOString(),
            paymentDueDate,
        };

        const updatedUser = {
            ...users[userIndex],
            balance: users[userIndex].balance + loanAmount,
            loans: [...users[userIndex].loans, newLoan],
        };

        const newUsers = [...users];
        newUsers[userIndex] = updatedUser;
        setUsers(newUsers);
        setCurrentUser(updatedUser);
        
        const loanCreditTransaction: Transaction = {
            id: `t-loan-${newLoan.id}`,
            userId: currentUser.id,
            type: 'credit',
            amount: loanAmount,
            description: `Loan Disbursement`,
            timestamp: new Date().toISOString(),
            partyName: "Nova Bank Loans",
            category: 'Income',
        };
        setTransactions(prev => [...prev, loanCreditTransaction]);

        return { success: true, message: `Congratulations! Your loan for $${loanAmount.toFixed(2)} has been approved. The funds are now available in your account.`, newLoan };
    };

    const requestPaymentExtension = (accountId: string, type: 'card' | 'loan'): { success: boolean; message: string; newDueDate?: string } => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex === -1) return { success: false, message: 'Error: Current user not found.' };
        
        if (Math.random() < 0.1) { // 10% rejection rate
             return { success: false, message: `We're sorry, but we were unable to process a payment extension for this account at this time.` };
        }
        
        let newDueDate: Date | null = null;
        let message = '';
        const updatedUser = { ...users[userIndex] };

        if (type === 'card') {
            const cardIndex = updatedUser.cards.findIndex(c => c.cardNumber.slice(-4) === accountId);
            if (cardIndex === -1) return { success: false, message: `Error: Card ending in ${accountId} not found.`};
            const originalDueDate = new Date(updatedUser.cards[cardIndex].paymentDueDate);
            newDueDate = new Date(originalDueDate.setDate(originalDueDate.getDate() + 14));
            updatedUser.cards[cardIndex].paymentDueDate = newDueDate.toISOString();
            message = `Success! Your payment due date for the card ending in ${accountId} has been extended to`;

        } else if (type === 'loan') {
            const loanIndex = updatedUser.loans.findIndex(l => l.id === accountId);
            if (loanIndex === -1) return { success: false, message: `Error: Loan with ID ${accountId} not found.`};
            const originalDueDate = new Date(updatedUser.loans[loanIndex].paymentDueDate);
            newDueDate = new Date(originalDueDate.setDate(originalDueDate.getDate() + 14));
            updatedUser.loans[loanIndex].paymentDueDate = newDueDate.toISOString();
            message = `Success! Your payment due date for loan ${accountId} has been extended to`;
        } else {
            return { success: false, message: `Invalid account type.` };
        }
        
        const newUsers = [...users];
        newUsers[userIndex] = updatedUser;
        setUsers(newUsers);
        setCurrentUser(updatedUser);
        
        const formattedDate = newDueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        return { success: true, message: `${message} ${formattedDate}.`, newDueDate: newDueDate.toISOString() };
    };

    const makeAccountPayment = (accountId: string, accountType: 'card' | 'loan', paymentType: 'minimum' | 'statement' | 'full' | 'custom', customAmount?: number): { success: boolean; message: string } => {
        if (!currentUser) return { success: false, message: 'Error: You are not logged in.' };

        const userIndex = users.findIndex(u => u.id === currentUser.id);
        const bankIndex = users.findIndex(u => u.id === 0); // Nova Bank user

        if (userIndex === -1 || bankIndex === -1) return { success: false, message: 'Error: User or bank account not found.' };

        let paymentAmount = 0;
        let message = '';
        const updatedUser = { ...users[userIndex] };
        const updatedUsers = [...users];

        if (accountType === 'card') {
            const cardIndex = updatedUser.cards.findIndex(c => c.cardNumber.slice(-4) === accountId);
            if (cardIndex === -1) return { success: false, message: `Error: Card ending in ${accountId} not found.`};
            const card = updatedUser.cards[cardIndex];

            switch(paymentType) {
                case 'minimum': paymentAmount = card.minimumPayment; break;
                case 'statement': paymentAmount = card.statementBalance; break;
                case 'full': paymentAmount = card.creditBalance; break;
                case 'custom':
                    if (!customAmount || customAmount <= 0) return { success: false, message: 'Error: A valid custom amount is required.' };
                    paymentAmount = customAmount;
                    break;
            }

            if (updatedUser.balance < paymentAmount) return { success: false, message: `Error: Insufficient funds. Your balance is ${formatCurrency(updatedUser.balance)}.` };

            updatedUser.balance -= paymentAmount;
            updatedUser.cards[cardIndex].creditBalance -= paymentAmount;
            if(updatedUser.cards[cardIndex].statementBalance > 0) {
                updatedUser.cards[cardIndex].statementBalance = Math.max(0, updatedUser.cards[cardIndex].statementBalance - paymentAmount);
            }
            if(updatedUser.cards[cardIndex].creditBalance < 0) updatedUser.cards[cardIndex].creditBalance = 0;

            message = `Successfully paid ${formatCurrency(paymentAmount)} towards your card ending in ${accountId}.`;

        } else if (accountType === 'loan') {
            const loanIndex = updatedUser.loans.findIndex(l => l.id === accountId);
            if (loanIndex === -1) return { success: false, message: `Error: Loan with ID ${accountId} not found.`};
            const loan = updatedUser.loans[loanIndex];

            switch(paymentType) {
                case 'minimum': paymentAmount = loan.monthlyPayment; break;
                case 'full': paymentAmount = loan.remainingBalance; break;
                case 'custom':
                    if (!customAmount || customAmount <= 0) return { success: false, message: 'Error: A valid custom amount is required.' };
                    paymentAmount = customAmount;
                    break;
                default:
                    paymentAmount = loan.monthlyPayment; break;
            }
            
            if (paymentAmount > loan.remainingBalance) paymentAmount = loan.remainingBalance;

            if (updatedUser.balance < paymentAmount) return { success: false, message: `Error: Insufficient funds. Your balance is ${formatCurrency(updatedUser.balance)}.` };

            updatedUser.balance -= paymentAmount;
            updatedUser.loans[loanIndex].remainingBalance -= paymentAmount;
            if(updatedUser.loans[loanIndex].remainingBalance <= 0) {
                updatedUser.loans[loanIndex].status = 'Paid Off';
                 message = `Successfully paid off your loan (${accountId}) with a final payment of ${formatCurrency(paymentAmount)}. Congratulations!`;
            } else {
                message = `Successfully paid ${formatCurrency(paymentAmount)} towards your loan (${accountId}).`;
            }
        } else {
            return { success: false, message: 'Invalid account type.' };
        }

        updatedUsers[bankIndex] = { ...updatedUsers[bankIndex], balance: updatedUsers[bankIndex].balance + paymentAmount };
        updatedUsers[userIndex] = updatedUser;
        setUsers(updatedUsers);
        setCurrentUser(updatedUser);

        const newTransaction: Transaction = {
            id: `t-payment-${Date.now()}`,
            userId: currentUser.id,
            type: 'debit',
            amount: paymentAmount,
            description: `Payment for ${accountType} ...${accountId.slice(-4)}`,
            timestamp: new Date().toISOString(),
            partyName: 'Nova Bank',
            category: 'Bills',
            cardId: accountType === 'card' ? currentUser.cards.find(c => c.cardNumber.slice(-4) === accountId)?.cardNumber : undefined
        };
        setTransactions(prev => [...prev, newTransaction]);

        return { success: true, message };
    };
    
    const registerPasskey = async () => {
        if (!currentUser || !isPasskeySupported) return;

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const userHandle = new TextEncoder().encode(currentUser.username);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: "Nova Bank", id: window.location.hostname },
                    user: {
                        id: userHandle,
                        name: currentUser.email,
                        displayName: currentUser.name,
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256
                    authenticatorSelection: {
                        residentKey: "required", // This makes it a passkey
                        userVerification: "required",
                    },
                    timeout: 60000,
                },
            });

            if (credential && 'rawId' in credential) {
                const newPasskey: Passkey = {
                    id: base64url.encode((credential as any).rawId),
                    created: new Date().toISOString(),
                };

                const allPasskeys = JSON.parse(localStorage.getItem('gemini-bank-passkeys') || '{}');
                const userPasskeys = allPasskeys[currentUser.username] || [];
                userPasskeys.push(newPasskey);
                allPasskeys[currentUser.username] = userPasskeys;
                
                localStorage.setItem('gemini-bank-passkeys', JSON.stringify(allPasskeys));
                setPasskeys(userPasskeys);
                showToast("Passkey created successfully!", 'success');
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to create passkey.", 'error');
        }
    };
    
    const loginWithPasskey = async (): Promise<boolean> => {
        if (!isPasskeySupported) return false;

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    userVerification: 'required',
                    timeout: 60000,
                },
            });

            if (assertion && (assertion as any).response.userHandle) {
                const userHandle = new TextDecoder().decode((assertion as any).response.userHandle);
                const user = users.find(u => u.username.toLowerCase() === userHandle.toLowerCase());

                if (user) {
                    setCurrentUser(user);
                    return true;
                }
            }
            showToast("Passkey not recognized.", 'error');
            return false;
        } catch (err) {
            console.error(err);
            showToast("Passkey login failed.", 'error');
            return false;
        }
    };
    
    const verifyCurrentUserWithPasskey = async (): Promise<boolean> => {
        if (!currentUser || !isPasskeySupported) {
            showToast("Passkey support is not available.", 'error');
            return false;
        }
        if (passkeys.length === 0) {
            showToast("No passkey registered for this account. Please register one in Settings.", 'error');
            return false;
        }

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    allowCredentials: passkeys.map(pk => ({
                        id: base64url.decode(pk.id),
                        type: 'public-key',
                    })),
                    userVerification: 'required',
                    timeout: 60000,
                },
            });

            return !!assertion;
        } catch (err) {
            console.error("Passkey verification error:", err);
            // Don't show a toast if the user intentionally cancels the prompt
            if ((err as Error).name !== 'NotAllowedError' && (err as Error).name !== 'AbortError') {
                showToast("Passkey verification failed.", 'error');
            }
            return false;
        }
    };
    
    const removePasskey = (passkeyId: string) => {
        if (!currentUser) return;
        const allPasskeys = JSON.parse(localStorage.getItem('gemini-bank-passkeys') || '{}');
        let userPasskeys = allPasskeys[currentUser.username] || [];
        userPasskeys = userPasskeys.filter((pk: Passkey) => pk.id !== passkeyId);
        allPasskeys[currentUser.username] = userPasskeys;

        localStorage.setItem('gemini-bank-passkeys', JSON.stringify(allPasskeys));
        setPasskeys(userPasskeys);
        showToast("Passkey removed.", 'success');
    };

    const contextValue = { currentUser, users, transactions, login, logout, registerUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, showToast, isPasskeySupported, passkeys, registerPasskey, loginWithPasskey, removePasskey, verifyCurrentUserWithPasskey };

    const screenKey = currentUser ? 'dashboard' : authScreen;
    
    const renderAuthScreen = () => {
        switch(authScreen) {
            case 'login':
                return <LoginScreen onLogin={login} onBack={() => setAuthScreen('welcome')} />;
            case 'register':
                return <RegisterScreen onRegister={registerUser} onBack={() => setAuthScreen('welcome')} />;
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