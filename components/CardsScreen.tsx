

import React, { useContext, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankContext } from '../App';
import { CardCarousel } from './CardCarousel';
import { ArrowUpRightIcon, CreditCardIcon } from './icons';
import { StatementSummaryModal } from './StatementSummaryModal';
import { Transaction, Card } from '../types';
import { useTranslation } from '../hooks/useTranslation';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

// FIX: Explicitly typed the component with React.FC to prevent TypeScript from incorrectly assigning the `key` prop.
const CardTransactionItem: React.FC<{ tx: Transaction; index: number }> = ({ tx, index }) => (
    <motion.li
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="flex items-center justify-between py-3"
    >
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full grid place-items-center bg-slate-700">
                <ArrowUpRightIcon className="w-5 h-5 text-slate-400" />
            </div>
            <div>
                <p className="font-semibold text-white">{tx.description}</p>
                <p className="text-sm text-slate-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
            </div>
        </div>
        <p className="font-bold text-slate-300">
            -{formatCurrency(tx.amount)}
        </p>
    </motion.li>
);

const CreditUsageDisplay = ({ card }: { card: Card }) => {
    const { t } = useTranslation();
    const usagePercentage = (card.creditBalance / card.creditLimit) * 100;
    
    return (
        <motion.div
            key={card.cardNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="px-4 mb-4"
        >
            <h3 className="font-semibold text-slate-300 mb-2">{t('creditUsage')}</h3>
            <div className="bg-slate-800 p-4 rounded-2xl">
                <div className="flex justify-between items-center mb-2 text-sm">
                    <p className="text-slate-300">{card.cardType} <span className="font-mono">...{card.cardNumber.slice(-4)}</span></p>
                    <p className="font-medium text-white">{formatCurrency(card.creditBalance)} / {formatCurrency(card.creditLimit)}</p>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <motion.div
                        className="bg-indigo-500 h-2.5 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${usagePercentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                </div>
            </div>
        </motion.div>
    );
};


export const CardsScreen: React.FC = () => {
    const { currentUser } = useContext(BankContext);
    const { t } = useTranslation();
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [filter, setFilter] = useState<'7d' | '30d' | 'month'>('30d');
    
    const cards = currentUser?.cards || [];
    const selectedCard = cards[carouselIndex];

    const filteredTransactions = useMemo(() => {
        if (!selectedCard) return [];
        const now = new Date();
        return selectedCard.transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            switch (filter) {
                case '7d':
                    return (now.getTime() - txDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
                case '30d':
                    return (now.getTime() - txDate.getTime()) < 30 * 24 * 60 * 60 * 1000;
                case 'month':
                    return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
                default: return true;
            }
        });
    }, [selectedCard, filter]);

    return (
        <div className="relative flex flex-col h-full">
            <div className="p-4 flex justify-between items-center">
                 <h2 className="text-lg font-semibold text-white">{t('yourCards')}</h2>
                 <button onClick={() => setIsSummaryModalOpen(true)} className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50" disabled={!selectedCard}>
                    {t('viewSummary')}
                 </button>
            </div>
            
            <CardCarousel cards={cards} onCardChange={setCarouselIndex} />
            
            <AnimatePresence mode="wait">
                {selectedCard && <CreditUsageDisplay card={selectedCard} />}
            </AnimatePresence>

            <div className="flex-grow flex flex-col px-4 pb-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-slate-300">{t('transactionHistory')}</h3>
                    <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-slate-800 text-sm text-slate-300 rounded-md p-1 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="7d">{t('last7Days')}</option>
                        <option value="30d">{t('last30Days')}</option>
                        <option value="month">{t('thisMonth')}</option>
                    </select>
                </div>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={selectedCard?.cardNumber || 'empty'}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-grow overflow-y-auto"
                    >
                        {filteredTransactions.length > 0 ? (
                            <ul className="divide-y divide-slate-800">
                                {filteredTransactions.map((tx, i) => <CardTransactionItem key={tx.id} tx={tx} index={i} />)}
                            </ul>
                        ) : (
                             <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-4">
                                <CreditCardIcon className="w-12 h-12" />
                                <p>{t('noTransactionsPeriod')}</p>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {selectedCard && (
                <StatementSummaryModal
                    isOpen={isSummaryModalOpen}
                    onClose={() => setIsSummaryModalOpen(false)}
                    card={selectedCard}
                />
            )}
        </div>
    );
};