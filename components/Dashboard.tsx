

import React, { useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankContext } from '../App';
import { MessageSquareIcon, HomeIcon, CreditCardIcon, SettingsIcon, DollarSignIcon, PlusIcon, LogoutIcon } from './icons';
import { ChatModal } from './ChatModal';
import { HomeScreen } from './HomeScreen';
import { CardsScreen } from './CardsScreen';
import { SettingsScreen } from './SettingsScreen';
import { LoansScreen } from './LoansScreen';
import { useTranslation } from '../hooks/useTranslation';
import { ApplicationModal } from './ApplicationModal';
import { analyzeSpendingWithAI } from '../services/geminiService';
import { Transaction } from '../types';

const NavItem = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 w-16 h-16 transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
    </button>
);

export const Dashboard = () => {
    const { currentUser, transactions, logout } = useContext(BankContext);
    const { t, language } = useTranslation();
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'home' | 'cards' | 'loans' | 'settings'>('home');
    const [spendingData, setSpendingData] = useState<{ name: string; value: number }[]>([]);
    const [isLoadingChart, setIsLoadingChart] = useState(true);

    useEffect(() => {
        const fetchSpendingAnalysis = async () => {
            if (!currentUser) return;
            setIsLoadingChart(true);
            
            const allUserSpendingTransactions = [
                ...transactions.filter(tx => tx.userId === currentUser.id && tx.type === 'debit'),
                ...currentUser.cards.flatMap(c => c.transactions)
            ];

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentTransactions = allUserSpendingTransactions.filter(tx => {
                const txDate = new Date(tx.timestamp);
                return txDate >= thirtyDaysAgo;
            });

            const analysisResult = await analyzeSpendingWithAI(recentTransactions, language);
            setSpendingData(analysisResult.sort((a, b) => b.value - a.value));
            setIsLoadingChart(false);
        };

        fetchSpendingAnalysis();
    }, [currentUser, transactions, language]);

    const renderContent = () => {
        switch (activeTab) {
            case 'home': return <HomeScreen spendingData={spendingData} isLoading={isLoadingChart} />;
            case 'cards': return <CardsScreen />;
            case 'loans': return <LoansScreen />;
            case 'settings': return <SettingsScreen />;
            default: return <HomeScreen spendingData={spendingData} isLoading={isLoadingChart} />;
        }
    };
    
    const applicationType = activeTab === 'cards' ? 'Card' : 'Loan';

    return (
        <div className="relative min-h-screen w-full bg-slate-900 flex flex-col max-w-md mx-auto border-x border-slate-800">
            <header className="flex justify-between items-center p-4 flex-shrink-0 pt-[calc(1rem+env(safe-area-inset-top))]">
                <div className="flex items-center gap-3">
                    <img src={useContext(BankContext).currentUser?.avatarUrl} alt="avatar" className="w-10 h-10 rounded-full border-2 border-slate-600" />
                     <div>
                        <p className="text-sm text-slate-400">{t('welcomeBack')},</p>
                        <h1 className="text-lg font-bold text-white">{useContext(BankContext).currentUser?.name}</h1>
                    </div>
                </div>
                <button onClick={logout} className="p-2 rounded-full text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors" aria-label={t('signOut')}>
                    <LogoutIcon className="w-6 h-6" />
                </button>
            </header>

            <main className="flex-grow flex flex-col overflow-y-auto pb-24">
                 <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex-grow"
                    >
                        {renderContent()}
                    </motion.div>
                </AnimatePresence>
            </main>
            
            <div className="fixed bottom-24 right-4 md:right-6 flex flex-col items-center gap-3 z-30">
                 <AnimatePresence>
                    {(activeTab === 'cards' || activeTab === 'loans') && (
                         <motion.button
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setIsApplyModalOpen(true)}
                            className="bg-green-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center"
                            aria-label={t('applyForNew', { type: applicationType })}
                        >
                            <PlusIcon className="w-8 h-8" />
                        </motion.button>
                    )}
                </AnimatePresence>
                 <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsChatOpen(true)}
                    className="bg-indigo-600 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center"
                    aria-label={t('openAIAssistant')}
                >
                    <MessageSquareIcon className="w-8 h-8" />
                </motion.button>
            </div>
            

            <footer className="w-full max-w-md mx-auto bg-slate-900/80 backdrop-blur-sm border-t border-slate-800 fixed bottom-0 left-0 right-0 z-20 pb-[env(safe-area-inset-bottom)]">
                <nav className="flex justify-around items-center h-20 px-2">
                    <NavItem icon={<HomeIcon className="w-6 h-6" />} label={t('navHome')} isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                    <NavItem icon={<CreditCardIcon className="w-6 h-6" />} label={t('navCards')} isActive={activeTab === 'cards'} onClick={() => setActiveTab('cards')} />
                    <NavItem icon={<DollarSignIcon className="w-6 h-6" />} label={t('navLoans')} isActive={activeTab === 'loans'} onClick={() => setActiveTab('loans')} />
                    <NavItem icon={<SettingsIcon className="w-6 h-6" />} label={t('navSettings')} isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                </nav>
            </footer>
            
            <ApplicationModal 
                isOpen={isApplyModalOpen}
                onClose={() => setIsApplyModalOpen(false)}
                applicationType={applicationType}
            />
            <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
};