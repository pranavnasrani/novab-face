import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { BankContext } from '../App';
import { DonutChart } from './DonutChart';
import { LightbulbIcon, SparklesIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, PiggyBankIcon, BankIcon, XCircleIcon } from './icons';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
};

export const InsightsScreen = () => {
    const { insightsData, isGeneratingInsights } = useContext(BankContext);
    const { t } = useTranslation();

    if (isGeneratingInsights) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 p-4">
                <SparklesIcon className="w-12 h-12 text-indigo-400 animate-pulse" />
                <h2 className="text-lg font-semibold text-white">{t('aiAnalyzing')}</h2>
                <p className="text-sm text-center">This may take a moment...</p>
            </div>
        );
    }
    
    if (!insightsData) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-4">
                <XCircleIcon className="w-12 h-12" />
                <h2 className="text-lg font-semibold text-white">{t('insightsError')}</h2>
                 <p className="text-sm text-center">We couldn't generate insights based on your recent activity.</p>
            </div>
        );
    }

    const { spendingAnalysis, spendingTrend, cashFlowForecast, savingOpportunities } = insightsData;

    return (
        <motion.div 
            className="p-4 flex flex-col gap-6 text-white"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <motion.div variants={itemVariants} className="text-center">
                <h2 className="text-xl font-bold">{t('aiPoweredInsights')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('aiInsightsDescription')}</p>
            </motion.div>
            
            <motion.div variants={itemVariants}>
                <h3 className="text-lg font-semibold text-white mb-2">{t('spendingTrends')}</h3>
                <div className="bg-slate-800 rounded-3xl p-4 flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full grid place-items-center flex-shrink-0 ${spendingTrend.percentageChange >= 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                        {spendingTrend.percentageChange >= 0 ? <ArrowTrendingUpIcon className="w-6 h-6" /> : <ArrowTrendingDownIcon className="w-6 h-6" />}
                    </div>
                    <div>
                        <p className="font-bold text-white text-lg">{Math.abs(spendingTrend.percentageChange).toFixed(0)}%</p>
                        <p className="text-sm text-slate-300">{spendingTrend.summary}</p>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('spendingAnalysis')}</h3>
                 <div className="bg-slate-800 rounded-3xl">
                    <DonutChart data={spendingAnalysis} />
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                <h3 className="text-lg font-semibold text-white mb-2">{t('cashFlowForecast')}</h3>
                <div className="bg-slate-800 rounded-3xl p-4 flex items-center gap-4">
                     <div className="w-12 h-12 rounded-full grid place-items-center flex-shrink-0 bg-blue-500/10 text-blue-400">
                        <BankIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-bold text-white text-lg">{formatCurrency(cashFlowForecast.projectedBalance)}</p>
                        <p className="text-sm text-slate-300">{t('projectedBalance')}</p>
                        <p className="text-xs text-slate-400 mt-1">{cashFlowForecast.summary}</p>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                 <h3 className="text-lg font-semibold text-white mb-2">{t('savingOpportunities')}</h3>
                 <div className="bg-slate-800 rounded-3xl p-4 space-y-3">
                     {savingOpportunities.map((tip, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-xl">
                            <div className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0 bg-yellow-500/10 text-yellow-400 mt-0.5">
                                <LightbulbIcon className="w-5 h-5" />
                            </div>
                            <p className="text-sm text-slate-300">{tip}</p>
                        </div>
                     ))}
                </div>
            </motion.div>
        </motion.div>
    );
};
