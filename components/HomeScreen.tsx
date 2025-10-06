
import React, { useContext, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../types';
import { BankContext } from '../App';
import { ArrowDownLeftIcon, ArrowUpRightIcon, BankIcon, CreditCardIcon, DollarSignIcon, ArrowTrendingUpIcon, SparklesIcon } from './icons';
import { useTranslation } from '../hooks/useTranslation';
import { DonutChart } from './DonutChart';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
};

const BalanceBreakdownItem = ({ icon, label, value, colorClass }: { icon: React.ReactNode, label: string, value: number, colorClass: string }) => (
    <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full grid place-items-center ${colorClass}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="font-bold text-white">{formatCurrency(value)}</p>
        </div>
    </div>
);

const BalanceCard = () => {
    const { currentUser } = useContext(BankContext);
    const { t } = useTranslation();

    const balances = useMemo(() => {
        if (!currentUser) return { savings: 0, cards: 0, loans: 0, investments: 0 };
        return {
            savings: currentUser.balance,
            cards: currentUser.cards.reduce((sum, card) => sum + card.creditBalance, 0),
            loans: currentUser.loans.reduce((sum, loan) => sum + loan.remainingBalance, 0),
            investments: 0, // Hardcoded as per requirement
        }
    }, [currentUser]);

    const totalBalance = balances.savings + balances.loans;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="p-4"
        >
            <div className="bg-slate-800 p-6 rounded-3xl shadow-lg text-white">
                <p className="text-slate-400">{t('totalBalance')}</p>
                <p className="text-4xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                    <BalanceBreakdownItem icon={<BankIcon className="w-5 h-5 text-green-300"/>} label={t('savings')} value={balances.savings} colorClass="bg-green-500/10" />
                    <BalanceBreakdownItem icon={<ArrowTrendingUpIcon className="w-5 h-5 text-blue-300"/>} label={t('investments')} value={balances.investments} colorClass="bg-blue-500/10" />
                    <BalanceBreakdownItem icon={<CreditCardIcon className="w-5 h-5 text-orange-300"/>} label={t('cards')} value={balances.cards} colorClass="bg-orange-500/10" />
                    <BalanceBreakdownItem icon={<DollarSignIcon className="w-5 h-5 text-red-300"/>} label={t('loans')} value={balances.loans} colorClass="bg-red-500/10" />
                </div>
            </div>
        </motion.div>
    );
};

const TransactionItem: React.FC<{ tx: Transaction; index: number }> = ({ tx, index }) => {
    const { t } = useTranslation();
    const isCredit = tx.type === 'credit';
    return (
        <motion.li
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="flex items-center justify-between py-4"
        >
            <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full grid place-items-center ${isCredit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    {isCredit ? <ArrowDownLeftIcon className="w-5 h-5 text-green-400" /> : <ArrowUpRightIcon className="w-5 h-5 text-red-400" />}
                </div>
                <div>
                    <p className="font-semibold text-white">{tx.description}</p>
                    <p className="text-sm text-slate-400">{t('vs')} {tx.partyName}</p>
                </div>
            </div>
            <p className={`font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                {isCredit ? '+' : '-'}
                {formatCurrency(tx.amount)}
            </p>
        </motion.li>
    );
};

const TransactionList = () => {
    const { currentUser, transactions } = useContext(BankContext);
    const { t } = useTranslation();
    const userTransactions = useMemo(() => {
        return transactions
            .filter(tx => tx.userId === currentUser?.id)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 3); // Show latest 3 transactions
    }, [transactions, currentUser]);

    return (
        <div className="p-4 flex-grow">
            <h2 className="text-lg font-semibold text-white mb-2">{t('recentActivity')}</h2>
            {userTransactions.length > 0 ? (
                <ul className="divide-y divide-slate-800">
                    {userTransactions.map((tx, i) => <TransactionItem key={tx.id} tx={tx} index={i} />)}
                </ul>
            ) : (
                <div className="text-center py-10 text-slate-500">
                    <p>{t('noTransactions')}</p>
                </div>
            )}
        </div>
    );
};

interface HomeScreenProps {
    spendingData: { name: string; value: number }[];
    isLoading: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ spendingData, isLoading }) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col h-full">
            <BalanceCard />

            <div className="p-4">
                 <h2 className="text-lg font-semibold text-white mb-2">{t('spendingThisMonth')}</h2>
                 <div className="bg-slate-800 rounded-3xl">
                     {isLoading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
                            <p>AI is analyzing your spending...</p>
                        </div>
                    ) : (
                        <DonutChart data={spendingData} />
                    )}
                </div>
            </div>
            
            <TransactionList />
        </div>
    );
};
