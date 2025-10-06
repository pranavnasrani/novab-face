import React, { useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankContext } from '../App';
import { MagicAiIcon, HomeIcon, CreditCardIcon, SettingsIcon, DollarSignIcon, PlusIcon, LogoutIcon, LightbulbIcon } from './icons';
import { ChatModal } from './ChatModal';
import { HomeScreen } from './HomeScreen';
import { CardsScreen } from './CardsScreen';
import { SettingsScreen } from './SettingsScreen';
import { LoansScreen } from './LoansScreen';
import { useTranslation } from '../hooks/useTranslation';
import { ApplicationModal } from './ApplicationModal';
import { InsightsScreen } from './InsightsScreen';

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
    
    const tabs = ['home', 'cards', 'loans', 'insights', 'settings'] as const;
    type Tab = typeof tabs[number];
    const [activeTab, setActiveTab] = useState<Tab>('home');
    const [direction, setDirection] = useState(0);

    const activeIndex = tabs.indexOf(activeTab);
    
    const setTab = (newTab: Tab) => {
        const newIndex = tabs.indexOf(newTab);
        if (newIndex > activeIndex) {
            setDirection(1);
        } else {
            setDirection(-1);
        }
        setActiveTab(newTab);
    };

    const handleDragEnd = (e: any, { offset, velocity }: { offset: { x: number, y: number }, velocity: { x: number, y: number }}) => {
        const swipe = Math.abs(offset.x) * velocity.x;
        const swipeConfidenceThreshold = 10000;

        if (swipe < -swipeConfidenceThreshold) { // Swipe Left
            const nextIndex = Math.min(activeIndex + 1, tabs.length - 1);
            if (nextIndex !== activeIndex) {
                setDirection(1);
                setActiveTab(tabs[nextIndex]);
            }
        } else if (swipe > swipeConfidenceThreshold) { // Swipe Right
            const prevIndex = Math.max(activeIndex - 1, 0);
            if (prevIndex !== activeIndex) {
                setDirection(-1);
                setActiveTab(tabs[prevIndex]);
            }
        }
    };

    const swipeVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? '100%' : '-100%',
            opacity: 0,
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? '100%' : '-100%',
            opacity: 0,
        }),
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'home': return <HomeScreen />;
            case 'cards': return <CardsScreen />;
            case 'loans': return <LoansScreen />;
            case 'insights': return <InsightsScreen />;
            case 'settings': return <SettingsScreen />;
            default: return <HomeScreen />;
        }
    };
    
    const applicationType = activeTab === 'cards' ? 'Card' : 'Loan';

    return (
        <div className="relative h-screen w-full bg-slate-900 flex flex-col max-w-md mx-auto border-x border-slate-800">
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

            <main className="flex-grow flex flex-col overflow-hidden">
                 <AnimatePresence mode="wait" initial={false} custom={direction}>
                    <motion.div
                        key={activeTab}
                        custom={direction}
                        variants={swipeVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                        className="flex-grow overflow-y-auto"
                    >
                        {renderContent()}
                    </motion.div>
                </AnimatePresence>
            </main>
            
            <div className="absolute bottom-24 right-4 flex flex-col items-center gap-3 z-30">
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
                    <MagicAiIcon className="w-8 h-8" />
                </motion.button>
            </div>
            

            <footer className="w-full max-w-md mx-auto bg-slate-900/80 backdrop-blur-sm border-t border-slate-800 z-20 pb-[env(safe-area-inset-bottom)] flex-shrink-0">
                <nav className="flex justify-around items-center h-20 px-2">
                    <NavItem icon={<HomeIcon className="w-6 h-6" />} label={t('navHome')} isActive={activeTab === 'home'} onClick={() => setTab('home')} />
                    <NavItem icon={<CreditCardIcon className="w-6 h-6" />} label={t('navCards')} isActive={activeTab === 'cards'} onClick={() => setTab('cards')} />
                    <NavItem icon={<DollarSignIcon className="w-6 h-6" />} label={t('navLoans')} isActive={activeTab === 'loans'} onClick={() => setTab('loans')} />
                    {/* FIX: Corrected a typo in the `isActive` prop. `active-tab` was being parsed as a subtraction operation, causing a compile error. */}
                    <NavItem icon={<LightbulbIcon className="w-6 h-6" />} label={t('navInsights')} isActive={activeTab === 'insights'} onClick={() => setTab('insights')} />
                    <NavItem icon={<SettingsIcon className="w-6 h-6" />} label={t('navSettings')} isActive={activeTab === 'settings'} onClick={() => setTab('settings')} />
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