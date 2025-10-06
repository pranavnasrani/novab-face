import { User, Transaction, Card, Loan } from './types';

const generateMockCardTransactions = (card: Omit<Card, 'transactions'>): Transaction[] => {
    const transactions: Transaction[] = [];
    let usedBalance = card.creditBalance;
    const today = new Date();

    const merchantsByCategory: Record<string, string[]> = {
        'Groceries': ['Whole Foods', 'SuperMart', 'Target'],
        'Transport': ['Uber', 'Shell Gas', 'Metro'],
        'Entertainment': ['Netflix', 'Spotify', 'Movieplex'],
        'Shopping': ['Amazon', 'Best Buy', 'Apple Store'],
        'Food': ['Starbucks', 'The Daily Grind', 'Pizza Palace'],
        'Bills': ['AT&T', 'Con Edison', 'Geico'],
    };
    
    const categories = Object.keys(merchantsByCategory);

    for (let i = 0; i < 25; i++) {
        if (usedBalance < 10) break;
        const amount = parseFloat((Math.random() * (Math.min(usedBalance * 0.2, 150)) + 5).toFixed(2));
        usedBalance -= amount;
        
        const transactionDate = new Date(today.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // within last 30 days
        const category = categories[Math.floor(Math.random() * categories.length)];
        const merchant = merchantsByCategory[category][Math.floor(Math.random() * merchantsByCategory[category].length)];

        transactions.push({
            id: `tx-card-${card.cardNumber.slice(-4)}-${i}`,
            uid: '', // Belongs to the card, user UID is higher up
            type: 'debit', // Card transactions are debits from the credit line
            amount,
            description: merchant,
            timestamp: transactionDate.toISOString(),
            partyName: 'Merchant',
            category,
            cardId: card.cardNumber,
        });
    }
    return transactions.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

const cardColors = [
    'from-indigo-500 to-purple-600',
    'from-sky-500 to-indigo-500',
    'from-emerald-500 to-lime-600',
    'from-pink-500 to-rose-500',
    'from-amber-500 to-orange-600',
];

const generateMockCard = (cardTypeParam?: 'Visa' | 'Mastercard'): Card => {
  // FIX: Explicitly typed `cardType` to prevent type widening to `string`.
  const cardType: 'Visa' | 'Mastercard' = cardTypeParam || (Math.random() > 0.5 ? 'Visa' : 'Mastercard');
  const cardNumber =
    cardType === 'Visa'
      ? '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('')
      : '5' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
  
  const expiryMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const expiryYear = String(new Date().getFullYear() + Math.floor(Math.random() * 5) + 2).slice(-2);
  
  const creditLimit = [5000, 10000, 15000, 20000][Math.floor(Math.random() * 4)];
  const creditBalance = parseFloat((Math.random() * creditLimit * 0.8).toFixed(2));
  
  const today = new Date();
  const paymentDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 15).toISOString(); // 15th of next month
  const statementBalance = parseFloat((creditBalance * (0.9 + Math.random() * 0.1)).toFixed(2)); // 90-100% of current balance
  const color = cardColors[Math.floor(Math.random() * cardColors.length)];

  const partialCard = {
    cardNumber,
    expiryDate: `${expiryMonth}/${expiryYear}`,
    cvv: String(Math.floor(Math.random() * 900) + 100),
    cardType,
    color,
    creditLimit,
    creditBalance,
    apr: parseFloat((Math.random() * 15 + 15).toFixed(2)), // e.g., 15% to 30%
    paymentDueDate,
    statementBalance,
    minimumPayment: parseFloat(Math.max(25, statementBalance * 0.02).toFixed(2)), // 2% or $25
  };
  
  return {
    ...partialCard,
    transactions: generateMockCardTransactions(partialCard),
  };
};

const generateMockLoan = (uid: string): Loan => {
    const loanAmount = [5000, 10000, 20000, 50000][Math.floor(Math.random() * 4)];
    const interestRate = parseFloat((Math.random() * 10 + 3).toFixed(2)); // 3% to 13%
    const termMonths = [24, 36, 48, 60][Math.floor(Math.random() * 4)];
    
    const monthlyInterestRate = interestRate / 100 / 12;
    const monthlyPayment = (loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) / (Math.pow(1 + monthlyInterestRate, termMonths) - 1);
    
    const today = new Date();
    const paymentDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString(); // 1st of next month

    return {
        id: `loan-${uid}-${Date.now()}${Math.random()}`,
        uid,
        loanAmount,
        interestRate,
        termMonths,
        monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
        remainingBalance: parseFloat((loanAmount * (0.5 + Math.random() * 0.4)).toFixed(2)), // Remaining balance between 50% and 90%
        status: 'Active',
        startDate: new Date(Date.now() - 86400000 * Math.floor(Math.random() * 365)).toISOString(),
        paymentDueDate
    };
};

const generateAccountNumber = (): string => {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}

// Exporting the helper for use in the App registration logic
export { generateMockCard, generateMockLoan, generateAccountNumber };