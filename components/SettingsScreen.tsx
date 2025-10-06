import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { BankContext } from '../App';
import { LogoutIcon, FingerprintIcon, PlusIcon } from './icons';
import { useTranslation } from '../hooks/useTranslation';

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export const SettingsScreen = () => {
    const { currentUser, logout, isPasskeySupported, passkeys, registerPasskey, removePasskey } = useContext(BankContext);
    const { t, language, setLanguage } = useTranslation();

    return (
        <div className="p-4 flex flex-col gap-6 text-white">
            <div className="bg-slate-800 p-6 rounded-3xl flex items-center gap-4">
                <img src={currentUser?.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full border-2 border-indigo-400"/>
                <div>
                    <h2 className="text-xl font-bold">{currentUser?.name}</h2>
                    <p className="text-slate-400">@{currentUser?.username}</p>
                </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-2xl">
                <label htmlFor="language-select" className="block text-sm font-medium text-slate-300 mb-2">{t('language')}</label>
                <select
                    id="language-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'es' | 'th' | 'tl')}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="th">ภาษาไทย</option>
                    <option value="tl">Tagalog</option>
                </select>
            </div>

            {isPasskeySupported && (
                <div className="bg-slate-800 p-4 rounded-2xl">
                    <h3 className="text-lg font-semibold mb-2">{t('passkeys')}</h3>
                    <p className="text-sm text-slate-400 mb-4">
                        {t('passkeyDescription')}
                    </p>
                    <div className="space-y-2 mb-4">
                        {passkeys.length > 0 ? (
                            passkeys.map(pk => (
                                <div key={pk.id} className="bg-slate-700/50 p-3 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FingerprintIcon className="w-5 h-5 text-indigo-400" />
                                        <div>
                                            <p className="text-sm font-medium text-slate-200">{t('passkey')}</p>
                                            <p className="text-xs text-slate-400">{t('createdOn')} {formatDate(pk.created)}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => removePasskey(pk.id)} className="text-xs text-red-400 hover:text-red-300">{t('remove')}</button>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500 text-center py-2">{t('noPasskeys')}</p>
                        )}
                    </div>

                    <motion.button
                        // FIX: Wrapped the `registerPasskey` call in an arrow function to prevent passing the event object, resolving a TypeScript type mismatch.
                        onClick={() => registerPasskey()}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full font-bold py-3 rounded-xl transition-all bg-indigo-600 text-white flex items-center justify-center gap-2"
                    >
                        <PlusIcon className="w-5 h-5"/>
                        {t('addPasskey')}
                    </motion.button>
                </div>
            )}

            <motion.button
                onClick={logout}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-slate-800 hover:bg-red-500/20 text-red-400 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
                <LogoutIcon className="w-5 h-5"/>
                {t('signOut')}
            </motion.button>
        </div>
    );
};