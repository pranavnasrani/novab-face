import React, { useContext, useState } from 'react';
import { motion } from 'framer-motion';
import { BankContext } from '../App';
import { Loan } from '../types';
import { DollarSignIcon, RefreshCwIcon } from './icons';
import { useTranslation } from '../hooks/useTranslation';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
};

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

// FIX: Explicitly typed the component with React.FC to prevent TypeScript from incorrectly assigning the `key` prop.
const LoanItem: React.FC<{ loan: Loan; index: number }> = ({ loan, index }) => {
    const { t } = useTranslation();
    const progress = (loan.loanAmount - loan.remainingBalance) / loan.loanAmount * 100;
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-slate-800 p-4 rounded-2xl"
        >
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="font-bold text-white text-lg">{formatCurrency(loan.loanAmount)}</p>
                    <p className="text-xs text-slate-400">@{loan.interestRate.toFixed(2)}% {t('forTerm')} {loan.termMonths} {t('months')}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm font-medium text-indigo-400">{t('monthlyPayment')}</p>
                    <p className="text-white font-semibold">{formatCurrency(loan.monthlyPayment)}</p>
                </div>
            </div>
            <div>
                 <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                    <p>{t('remaining')}: <span className="font-semibold text-slate-300">{formatCurrency(loan.remainingBalance)}</span></p>
                    <p>{t('nextPayment')}: <span className="font-semibold text-slate-300">{formatDate(loan.paymentDueDate)}</span></p>
                 </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                    <motion.div 
                        className="bg-indigo-500 h-2 rounded-full" 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%`}}
                        transition={{ duration: 0.8, delay: index * 0.1 + 0.2 }}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export const LoansScreen = () => {
    const { currentUser, refreshUserData, isRefreshing } = useContext(BankContext);
    const { t } = useTranslation();
    const activeLoans = currentUser?.loans.filter(l => l.status === 'Active') || [];

    return (
        <div className="relative flex flex-col">
            <div className="p-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">{t('yourLoans')}</h2>
                <button
                    onClick={refreshUserData}
                    disabled={isRefreshing}
                    className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    aria-label="Refresh loans"
                >
                    <RefreshCwIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <div className="p-4 flex-grow flex flex-col gap-4">
                {activeLoans.length > 0 ? (
                    activeLoans.map((loan, i) => <LoanItem key={loan.id} loan={loan} index={i} />)
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-slate-500 gap-4">
                        <DollarSignIcon className="w-16 h-16" />
                        <p>{t('noActiveLoans')}</p>
                        <p className="text-sm">{t('applyForLoanHint')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};