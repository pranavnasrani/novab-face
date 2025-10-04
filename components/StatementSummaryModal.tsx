import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface StatementSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Card;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-center py-3 border-b border-slate-700">
        <p className="text-slate-400">{label}</p>
        <p className="font-bold text-white">{value}</p>
    </div>
);

export const StatementSummaryModal: React.FC<StatementSummaryModalProps> = ({ isOpen, onClose, card }) => {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-slate-800 w-full max-w-md rounded-3xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-white">{t('statementSummary')}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </header>
            
            <div className="p-6 text-sm">
                <p className="text-center text-slate-400 mb-4">
                    {t('forCardEndingIn')} <span className="font-mono text-slate-300">{card.cardNumber.slice(-4)}</span>
                </p>
                <div className="mb-4">
                    <InfoRow label={t('statementBalance')} value={formatCurrency(card.statementBalance)} />
                    <InfoRow label={t('minimumPaymentDue')} value={formatCurrency(card.minimumPayment)} />
                    <InfoRow label={t('paymentDueDate')} value={formatDate(card.paymentDueDate)} />
                </div>

                <div className="bg-slate-700/50 p-3 rounded-xl text-xs text-slate-300 space-y-1">
                    <h4 className="font-bold text-sm text-slate-200">{t('importantInformation')}</h4>
                    <p>{t('lateFeeWarning')}</p>
                </div>

                <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all mt-6">
                    {t('gotIt')}
                </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};