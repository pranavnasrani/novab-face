import React, { useState, useEffect, useContext } from 'react';
// FIX: Imported the `Variants` type from framer-motion to correctly type the animation variants object.
import { motion, Variants } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { BankContext } from '../App';
import { DonutChart } from './DonutChart';
// FIX: Corrected the import name from `TrendingUpIcon` to `ArrowTrendingUpIcon` to match the exported component in `icons.tsx`.
import { LightbulbIcon, SparklesIcon, ArrowTrendingUpIcon, TrendingDownIcon, PiggyBankIcon, CalendarDaysIcon, RefreshCwIcon, GlobeIcon } from './icons';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

// FIX: Explicitly typed `cardVariants` with the `Variants` type from framer-motion to resolve type inference issues.
const cardVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.1,
            duration: 0.5,
            ease: "easeOut"
        }
    })
};

export const InsightsScreen = () => {
    const { insightsData, loadOrGenerateInsights, refreshInsights, isInsightsLoading } = useContext(BankContext);
    const { t, language } = useTranslation();

    useEffect(() => {
        if (!insightsData) {
            loadOrGenerateInsights();
        }
    }, [loadOrGenerateInsights, insightsData]);

    const data = insightsData?.data?.[language];

    if (isInsightsLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-4">
                <SparklesIcon className="w-12 h-12 text-indigo-400 animate-pulse" />
                <p className="font-semibold">{t('aiAnalyzingSpending')}</p>
                <p className="text-sm text-center">{t('aiInsightsDescription')}</p>
            </div>
        );
    }
    
    if (!data) {
         return (
            <div className="flex flex-col h-full">
                <div className="p-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold">{t('aiPoweredInsights')}</h2>
                    <button 
                        onClick={refreshInsights} 
                        disabled={isInsightsLoading}
                        className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                        aria-label="Refresh Insights"
                    >
                        <RefreshCwIcon className={`w-5 h-5 ${isInsightsLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <div className="flex-grow flex flex-col items-center justify-center text-slate-500 gap-3 p-4">
                    <LightbulbIcon className="w-12 h-12" />
                    <h3 className="font-semibold text-lg text-slate-300">{t('notEnoughData')}</h3>
                    <p className="text-sm text-center">{t('notEnoughDataDescription')}</p>
                </div>
            </div>
        );
    }
    

    return (
        <div className="p-4 flex flex-col gap-6 text-white">
            <div className="text-center">
                 <div className="flex justify-center items-center gap-2 relative">
                    <h2 className="text-xl font-bold">{t('aiPoweredInsights')}</h2>
                    {insightsData && (
                         <button 
                            onClick={refreshInsights} 
                            disabled={isInsightsLoading}
                            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            aria-label="Refresh Insights"
                        >
                            <RefreshCwIcon className={`w-5 h-5 ${isInsightsLoading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
                {insightsData?.lastUpdated && (
                    <p className="text-xs text-slate-500">
                        {new Date(insightsData.lastUpdated).toLocaleString()}
                    </p>
                )}
                <p className="text-sm text-slate-400 mt-1">{t('aiInsightsDescription')}</p>
            </div>
            
            <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariants}>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('spendingBreakdown')}</h3>
                 <div className="bg-slate-800 rounded-3xl">
                    <DonutChart data={data.spendingBreakdown} />
                </div>
            </motion.div>

            <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariants}>
                <h3 className="text-lg font-semibold text-white mb-2">{t('spendingTrends')}</h3>
                <div className="bg-slate-800 rounded-3xl p-4 space-y-3">
                    <div className={`flex items-center gap-2 p-3 rounded-xl ${data.overallSpendingChange > 0 ? 'bg-red-500/10 text-red-300' : 'bg-green-500/10 text-green-300'}`}>
                        {/* FIX: Replaced `TrendingUpIcon` with the correctly imported `ArrowTrendingUpIcon`. */}
                        {data.overallSpendingChange > 0 ? <ArrowTrendingUpIcon className="w-6 h-6"/> : <TrendingDownIcon className="w-6 h-6"/>}
                        <div>
                            <p className="font-bold text-lg">{Math.abs(data.overallSpendingChange).toFixed(1)}%</p>
                            <p className="text-xs">{t('spendingVsLastMonth')}</p>
                        </div>
                    </div>
                     {data.topCategoryChanges.map((change, i) => (
                        <div key={i} className="flex justify-between items-center text-sm p-2">
                           <p className="text-slate-300">{change.category}</p>
                           <div className={`flex items-center gap-1 font-semibold ${change.changePercent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                             {/* FIX: Replaced `TrendingUpIcon` with the correctly imported `ArrowTrendingUpIcon`. */}
                             {change.changePercent > 0 ? <ArrowTrendingUpIcon className="w-4 h-4"/> : <TrendingDownIcon className="w-4 h-4"/>}
                             <span>{Math.abs(change.changePercent).toFixed(0)}%</span>
                           </div>
                        </div>
                     ))}
                </div>
            </motion.div>
            
            <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants}>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('cashFlowForecast')}</h3>
                 <div className="bg-slate-800 rounded-3xl p-4 flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 grid place-items-center bg-blue-500/10 rounded-full text-blue-300">
                        <CalendarDaysIcon className="w-6 h-6" />
                    </div>
                    <p className="text-sm text-slate-300">{data.cashFlowForecast}</p>
                </div>
            </motion.div>

            <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants}>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('savingOpportunities')}</h3>
                 <div className="bg-slate-800 rounded-3xl p-4 space-y-3">
                    {data.savingOpportunities.map((opp, i) => (
                        <div key={i} className="bg-slate-700/50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                                <p className="text-sm text-slate-200 flex-1 pr-4">{opp.suggestion}</p>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-bold text-green-400">{formatCurrency(opp.potentialSavings)}</p>
                                    <p className="text-xs text-slate-400">/{t('monthly')}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
            </motion.div>

            {data.subscriptions.length > 0 && (
                <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
                    <h3 className="text-lg font-semibold text-white mb-2">{t('subscriptionTracker')}</h3>
                    <div className="bg-slate-800 rounded-3xl p-4">
                        <ul className="space-y-2">
                        {data.subscriptions.map((sub, i) => (
                                <li key={i} className="flex justify-between items-center p-2 rounded-lg bg-slate-700/50">
                                    <span className="font-medium text-slate-200">{sub.name}</span>
                                    <span className="font-bold text-white">{formatCurrency(sub.amount)}<span className="text-xs text-slate-400">/{t('monthly')}</span></span>
                                </li>
                        ))}
                        </ul>
                    </div>
                </motion.div>
            )}
        </div>
    );
};
