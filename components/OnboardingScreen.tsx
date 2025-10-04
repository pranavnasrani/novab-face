
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { GlobeIcon } from './icons';

interface WelcomeScreenProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
}

const slides = [
  {
    titleKey: 'carouselTitle1',
    imageUrl: 'https://i.ibb.co/k6WrpMf2/Google-AI-Studio-2025-10-04-T06-46-08-345-Z.png',
  },
  {
    titleKey: 'carouselTitle2',
    imageUrl: 'https://i.ibb.co/6JWY9ryP/Google-AI-Studio-2025-10-04-T06-45-20-664-Z.png',
  },
  {
    titleKey: 'carouselTitle3',
    imageUrl: 'https://i.ibb.co/7NQC8VyL/Google-AI-Studio-2025-10-04-T06-44-29-364-Z.png',
  },
  {
    titleKey: 'carouselTitle4',
    imageUrl: 'https://i.ibb.co/4n3W9b89/Google-AI-Studio-2025-10-04-T06-43-43-153-Z.png',
  },
];

const variants = {
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

const LanguageSelector = () => {
    const { language, setLanguage } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const handleLanguageChange = (lang: 'en' | 'es' | 'th' | 'tl') => {
        setLanguage(lang);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="text-white/80 hover:text-white transition-colors">
                <GlobeIcon className="w-6 h-6" />
            </button>
            <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 w-32 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden z-10"
                >
                    <button onClick={() => handleLanguageChange('en')} className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-indigo-600">English</button>
                    <button onClick={() => handleLanguageChange('es')} className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-indigo-600">Español</button>
                    <button onClick={() => handleLanguageChange('th')} className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-indigo-600">ภาษาไทย</button>
                    <button onClick={() => handleLanguageChange('tl')} className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-indigo-600">Tagalog</button>
                </motion.div>
            )}
            </AnimatePresence>
        </div>
    )
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNavigateToLogin, onNavigateToRegister }) => {
  const { t } = useTranslation();
  const [[page, direction], setPage] = useState([0, 0]);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
        if (!isExiting) {
          setPage(([prevPage, prevDirection]) => [(prevPage + 1) % slides.length, 1]);
        }
    }, 4000); // Change slide every 4 seconds
    return () => clearInterval(interval);
  }, [isExiting]);

  const handleNavigate = (navFunc: () => void) => {
    setIsExiting(true);
    setTimeout(() => {
      navFunc();
    }, 600); // Allow animation to play
  };

  const slide = slides[page];

  return (
    <div className={`min-h-screen w-full animated-bubble-bg ${isExiting ? 'exiting' : ''}`}>
        <div className="bubbles-wrapper" aria-hidden="true">
            <div className="bubble b1"></div>
            <div className="bubble b2"></div>
            <div className="bubble b3"></div>
            <div className="bubble b4"></div>
        </div>
        <div className="content-wrapper min-h-screen w-full text-white flex flex-col items-center justify-between p-6 overflow-hidden">
        
        <header className="w-full flex justify-end items-start pt-8">
            <LanguageSelector />
        </header>

        <main className="w-full max-w-md flex flex-col justify-center items-center flex-grow pb-4">
            <img src="https://i.ibb.co/PGQV6Z6W/4a5ed823-ab85-47ea-ac90-818fe3ed761f.png" alt="Nova Bank Logo" className="h-12 w-37" />
            <div className="relative w-full aspect-[4/5] rounded-3xl mt-4 mb-4 overflow-hidden shadow-2xl bg-slate-900">
            <AnimatePresence initial={false} custom={direction}>
                    <motion.img
                        key={page}
                        src={slide.imageUrl}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: 'spring', stiffness: 300, damping: 30 },
                            opacity: { duration: 0.3 }
                        }}
                        className="absolute w-full h-full object-cover"
                    />
                </AnimatePresence>
            </div>

            <motion.div
                key={`text-${page}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                className="text-center py-4"
            >
            <h1 className="text-3xl font-semibold tracking-tight">{t(slide.titleKey as any)}</h1>
            </motion.div>
        </main>

        <motion.footer 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
            className="w-full max-w-md flex flex-col items-center gap-4 pb-4">
            <motion.button
            onClick={() => handleNavigate(onNavigateToRegister)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg"
            >
                {t('getStarted')}
            </motion.button>
            <motion.button
            onClick={() => handleNavigate(onNavigateToLogin)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg"
            >
                {t('logIn')}
            </motion.button>
        </motion.footer>
        </div>
    </div>
  );
};