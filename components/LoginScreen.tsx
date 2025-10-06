import React, { useState, useContext, useEffect } from 'react';
// FIX: Imported the `Variants` type from framer-motion to explicitly type the animation variants, resolving a TypeScript error where the `type` property was being inferred as a generic `string` instead of a specific animation type.
import { motion, Variants } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { ChevronLeftIcon, FingerprintIcon } from './icons';
import { BankContext } from '../App';

const formVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { staggerChildren: 0.1, delayChildren: 0.2 } 
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 }
  },
};

const InputField = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input 
      {...props}
      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
    />
);

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  onBack: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onBack }) => {
  const { t } = useTranslation();
  const { loginWithPasskey, isPasskeySupported } = useContext(BankContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError('');
    const success = await onLogin(username, password);
    if (!success) {
      setError(t('loginError'));
      setPassword('');
    }
    // On success, the main App component will handle navigation
    setIsAuthenticating(false);
  };
  
  const handlePasskeyLogin = async () => {
      setIsAuthenticating(true);
      setError('');
      const success = await loginWithPasskey();
      if (!success) {
          // Error toasts might be shown from the context, or we can set a local error
          // For now, we assume context handles it or failure is silent until another attempt
      }
      setIsAuthenticating(false);
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
              src="https://i.ibb.co/PGQV6Z6W/4a5ed823-ab85-47ea-ac90-818fe3ed761f.png" alt="Nova Bank Logo" className="h-12 w-40 mx-auto" 
            />
          </div>
          
          <motion.div
              variants={formVariants}
              initial="hidden"
              animate="visible"
              className="bg-slate-900/50 p-8 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden border border-slate-700/50"
          >
            <form onSubmit={handleLogin} className="space-y-6">
              <motion.h2 variants={itemVariants} className="text-2xl font-bold text-center mb-2 text-white">{t('welcomeBack')}</motion.h2>

              {isPasskeySupported && (
                <motion.div variants={itemVariants} className="!mt-4">
                    <motion.button
                        type="button"
                        onClick={handlePasskeyLogin}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3.5 rounded-xl transition-all text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                        disabled={isAuthenticating}
                    >
                        <FingerprintIcon className="w-5 h-5" />
                        {isAuthenticating ? t('authenticating') : t('signInWithPasskey')}
                    </motion.button>
                </motion.div>
              )}
               <motion.div variants={itemVariants} className="flex items-center text-center !my-4">
                  <div className="flex-grow border-t border-slate-700"></div>
                  <span className="flex-shrink mx-4 text-slate-500 text-xs">OR</span>
                  <div className="flex-grow border-t border-slate-700"></div>
              </motion.div>

              <motion.div variants={itemVariants}>
                <InputField type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholderLogin')} disabled={isAuthenticating} />
              </motion.div>
              <motion.div variants={itemVariants}>
                <InputField type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password')} disabled={isAuthenticating} />
              </motion.div>
              {error && <p className="text-red-400 text-sm text-center !mt-4">{error}</p>}
              <motion.div variants={itemVariants}>
                <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all text-lg disabled:opacity-50" disabled={isAuthenticating}>
                {isAuthenticating ? t('authenticating') : t('signIn')}
                </motion.button>
              </motion.div>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};