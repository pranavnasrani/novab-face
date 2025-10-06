import React, { useState, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BankContext, CardApplicationDetails } from '../App';
import { useTranslation } from '../hooks/useTranslation';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationType: 'Card' | 'Loan';
}

export const ApplicationModal: React.FC<ApplicationModalProps> = ({ isOpen, onClose, applicationType }) => {
  const { currentUser, addCardToUser, addLoanToUser, showToast, verifyCurrentUserWithPasskey } = useContext(BankContext);
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    fullName: currentUser?.name || '',
    address: '',
    dateOfBirth: '',
    employmentStatus: 'Employed',
    employer: '',
    annualIncome: '',
    loanAmount: '10000',
    loanTerm: '36',
    cardType: 'Visa',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setFormData({
            fullName: currentUser?.name || '',
            address: '',
            dateOfBirth: '',
            employmentStatus: 'Employed',
            employer: '',
            annualIncome: '',
            loanAmount: '10000',
            loanTerm: '36',
            cardType: 'Visa',
        });
        setIsSubmitting(false);
    }
  }, [isOpen, currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const isVerified = await verifyCurrentUserWithPasskey();
    if (!isVerified) {
        showToast(t('actionCancelled'), 'error');
        setIsSubmitting(false);
        return;
    }

    const baseDetails = {
        fullName: formData.fullName,
        address: formData.address,
        dateOfBirth: formData.dateOfBirth,
        employmentStatus: formData.employmentStatus,
        employer: formData.employer,
        annualIncome: parseFloat(formData.annualIncome) || 0,
    };

    let result;
    if (applicationType === 'Card') {
        const cardDetails: CardApplicationDetails = { ...baseDetails, cardType: formData.cardType as 'Visa' | 'Mastercard' };
        result = await addCardToUser(cardDetails);
    } else {
        const loanDetails = {
            ...baseDetails,
            loanAmount: parseFloat(formData.loanAmount) || 0,
            loanTerm: parseInt(formData.loanTerm, 10) || 0,
        };
        result = await addLoanToUser(loanDetails);
    }
    
    showToast(result.message, result.success ? 'success' : 'error');
    setIsSubmitting(false);
    if (result.success) {
        onClose();
    }
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-700/50 p-3 rounded-xl text-xs text-slate-300 space-y-1">
        <h4 className="font-bold text-sm text-slate-200">{t('pleaseNote')}</h4>
        {applicationType === 'Card' ? (
            <p><strong>{t('repAPR')}:</strong> {t('cardAPRNote')}</p>
        ) : (
            <p><strong>{t('interestRates')}:</strong> {t('loanAPRNote')}</p>
        )}
      </div>
      <InputField name="fullName" label={t('fullName')} value={formData.fullName} onChange={handleChange} />
      <InputField name="address" label={t('address')} value={formData.address} onChange={handleChange} placeholder={t('addressPlaceholder')} />
      <InputField name="dateOfBirth" label={t('dateOfBirth')} value={formData.dateOfBirth} onChange={handleChange} type="date" />
      
      {applicationType === 'Card' && (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('cardType')}</label>
            <select name="cardType" value={formData.cardType} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Visa</option>
                <option>Mastercard</option>
            </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{t('employmentStatus')}</label>
        <select name="employmentStatus" value={formData.employmentStatus} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option>{t('employed')}</option>
            <option>{t('selfEmployed')}</option>
            <option>{t('unemployed')}</option>
            <option>{t('student')}</option>
        </select>
      </div>
      <InputField name="employer" label={t('employer')} value={formData.employer} onChange={handleChange} placeholder={t('employerPlaceholder')}/>
      <InputField name="annualIncome" label={t('annualIncome')} value={formData.annualIncome} onChange={handleChange} type="number" placeholder="e.g., 50000" />
      
      {applicationType === 'Loan' && (
        <>
            <InputField name="loanAmount" label={t('loanAmount')} value={formData.loanAmount} onChange={handleChange} type="number" />
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('loanTerm')}</label>
                <select name="loanTerm" value={formData.loanTerm} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="24">24 {t('months')}</option>
                    <option value="36">36 {t('months')}</option>
                    <option value="48">48 {t('months')}</option>
                    <option value="60">60 {t('months')}</option>
                </select>
            </div>
        </>
      )}
      <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submitApplication')}
      </button>
    </form>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-slate-800 w-full max-w-md rounded-3xl flex flex-col overflow-hidden max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-white">{t('newApplication', { type: applicationType })}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </header>
            
            <div className="p-6 overflow-y-auto">
                {renderForm()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const InputField = ({ name, label, value, onChange, type = 'text', placeholder = '' } : { name: string, label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, type?: string, placeholder?: string }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        {/* FIX: Removed the non-standard <style jsx> tag which caused a type error, and applied Tailwind classes directly for styling. */}
        <input 
            type={type} 
            name={name}
            id={name}
            value={value} 
            onChange={onChange} 
            placeholder={placeholder}
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
    </div>
);