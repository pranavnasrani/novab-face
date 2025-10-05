import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { BankContext } from '../App';
import { analyzeSpendingWithAI, identifySubscriptions } from '../services/geminiService';
import { DonutChart } from './DonutChart';
import { LightbulbIcon, SparklesIcon } from './icons';
import { Transaction } from '../types';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export const InsightsScreen = () => {
    const { currentUser, transactions } = useContext(BankContext);
    const { t, language } = useTranslation();
    
    const [spendingData, setSpendingData] = useState<{ name: string; value: number }[]>([]);
    const [isLoadingSpending, setIsLoadingSpending] = useState(true);
    
    const [subscriptions, setSubscriptions] = useState<{ name: string; amount: number }[]>([]);
    const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);

    useEffect(() => {
        const fetchInsights = async () => {
            if (!currentUser) return;

            setIsLoadingSpending(true);
            setIsLoadingSubscriptions(true);
            
            const allUserSpendingTransactions = [
                ...transactions.filter(tx => tx.uid === currentUser.uid && tx.type === 'debit'),
                ...currentUser.cards.flatMap(c => c.transactions)
            ];

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentTransactions = allUserSpendingTransactions.filter(tx => new Date(tx.timestamp) >= thirtyDaysAgo);

            // Fetch both analyses in parallel
            const [spendingResult, subscriptionResult] = await Promise.all([
                analyzeSpendingWithAI(recentTransactions, language),
                identifySubscriptions(recentTransactions, language)
            ]);
            
            setSpendingData(spendingResult.sort((a, b) => b.value - a.value));
            setIsLoadingSpending(false);
            
            setSubscriptions(subscriptionResult.sort((a, b) => b.amount - a.amount));
            setIsLoadingSubscriptions(false);
        };

        fetchInsights();
    }, [currentUser, transactions, language]);

    return (
        <div className="p-4 flex flex-col gap-6 text-white">
            <div className="text-center">
                <h2 className="text-xl font-bold">{t('aiPoweredInsights')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('aiInsightsDescription')}</p>
            </div>
            
            {/* Spending Analysis Card */}
            <div>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('spendingThisMonth')}</h3>
                 <div className="bg-slate-800 rounded-3xl">
                     {isLoadingSpending ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
                            <p>{t('aiAnalyzingSpending')}</p>
                        </div>
                    ) : (
                        <DonutChart data={spendingData} />
                    )}
                </div>
            </div>

            {/* Subscription Tracker Card */}
            <div>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('subscriptionTracker')}</h3>
                 <div className="bg-slate-800 rounded-3xl p-4">
                     {isLoadingSubscriptions ? (
                        <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
                            <p>{t('aiAnalyzingSubscriptions')}</p>
                        </div>
                    ) : subscriptions.length > 0 ? (
                        <ul className="space-y-2">
                           {subscriptions.map((sub, i) => (
                                <li key={i} className="flex justify-between items-center p-2 rounded-lg bg-slate-700/50">
                                    <span className="font-medium text-slate-200">{sub.name}</span>
                                    <span className="font-bold text-white">{formatCurrency(sub.amount)}<span className="text-xs text-slate-400">/{t('monthly')}</span></span>
                                </li>
                           ))}
                        </ul>
                    ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-slate-500 gap-2">
                            <LightbulbIcon className="w-10 h-10" />
                            <p className="text-sm">{t('noSubscriptionsFound')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
