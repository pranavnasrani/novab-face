
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { UserIcon, LockIcon, ChevronLeftIcon, MailIcon, PhoneIcon } from './icons';

interface RegisterScreenProps {
  onRegister: (name: string, username: string, pin: string, email: string, phone: string) => boolean;
  onBack: () => void;
}

const InputField = ({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <motion.div
    className="relative"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400">
      {icon}
    </div>
    <input 
      {...props}
      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
    />
  </motion.div>
);

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onRegister, onBack }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !username || pin.length !== 4 || !email || !phone) {
        setError(t('registerError'));
        return;
    }
    if (!onRegister(name, username, pin, email, phone)) {
      setError(t('registerErrorUsernameTaken'));
    }
  };

  const formVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1, duration: 0.5 } },
    exit: { opacity: 0, y: -50 },
  };

  return (
    <div className="min-h-screen w-full animated-bubble-bg">
      <div className="bubbles-wrapper" aria-hidden="true">
        <div className="bubble b1"></div>
        <div className="bubble b2"></div>
        <div className="bubble b3"></div>
        <div className="bubble b4"></div>
      </div>
      <div className="content-wrapper min-h-screen w-full text-white flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <button onClick={onBack} className="absolute top-16 left-6 text-slate-300 hover:text-white transition-colors">
              <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <div className="text-center mb-8">
            <motion.img 
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.7, ease: 'easeOut' }}
              src="https://i.ibb.co/PGQV6Z6W/4a5ed823-ab85-47ea-ac90-818fe3ed761f.png" 
              alt="Nova Bank Logo" 
              className="h-12 w-40 mx-auto" 
            />
          </div>
          
          <motion.div
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-slate-900/50 p-8 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden border border-slate-700/50"
          >
            <form onSubmit={handleRegister} className="space-y-5">
              <h2 className="text-2xl font-bold text-center mb-2 text-white">{t('createAccount')}</h2>
              <InputField icon={<UserIcon />} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fullNamePlaceholder')} />
              <InputField icon={<UserIcon />} type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
              <InputField icon={<MailIcon />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} />
              <InputField icon={<PhoneIcon />} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phonePlaceholder')} />
              <InputField icon={<LockIcon />} type="password" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={4} placeholder="****" />
              {error && <p className="text-red-400 text-sm text-center !mt-4">{error}</p>}
              <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg">{t('getStarted')}</motion.button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};