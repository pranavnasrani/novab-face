import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createChatSession, extractPaymentDetailsFromImage, analyzeSpendingWithAI } from '../services/geminiService';
import { BankContext, CardApplicationDetails, LoanApplicationDetails } from '../App';
import { SparklesIcon, MicrophoneIcon, SendIcon, CameraIcon } from './icons';
import { Chat } from '@google/genai';
import { Transaction, Card, Loan } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  id: number;
  sender: 'user' | 'ai' | 'system';
  text: string;
};

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
    recognition.continuous = true;
    recognition.interimResults = true;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, transferMoney, users, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, transactions } = useContext(BankContext);
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);
  const speechTimeoutRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef('');
  const manualStopRef = useRef(false);

  const contacts = users.filter(u => u.id !== currentUser?.id).map(u => u.name);

  useEffect(() => {
    if (isOpen && currentUser) {
        setMessages([{ id: messageId.current++, sender: 'ai', text: t('chatGreeting', { name: currentUser?.name.split(' ')[0] })}]);
        setInputValue('');
        setChat(createChatSession(currentUser.name, contacts, language, currentUser.cards, currentUser.loans));
    } else {
        setChat(null);
        if (isListening) {
            recognition?.stop();
        }
    }
    
    if (recognition) {
        // Update speech recognition language to match app language
        const langMap = {
            en: 'en-US',
            es: 'es-ES',
            th: 'th-TH',
            tl: 'tl-PH'
        };
        recognition.lang = langMap[language];
    }
  }, [isOpen, currentUser, language]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (prompt: string) => {
    if (!prompt.trim() || isLoading || !currentUser || !chat) return;
    
    if (isListening) {
        manualStopRef.current = true;
        recognition.stop();
    }

    const userMessage: Message = { id: messageId.current++, sender: 'user', text: prompt };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: prompt });
      
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        const functionResponseParts = [];
        
        for (const call of functionCalls) {
            let resultMessage = "An unknown function was called.";
            let resultForModel: object = { success: false, message: 'Function not found' };

            const findCard = (last4?: string) => {
                if (!last4) return currentUser.cards[0];
                return currentUser.cards.find(c => c.cardNumber.slice(-4) === last4);
            }

            if (call.name === 'initiatePayment') {
                const { recipientName, recipientAccountNumber, recipientEmail, recipientPhone, amount } = call.args;
                const recipientIdentifier = (recipientAccountNumber || recipientEmail || recipientPhone || recipientName) as string;
                const result = transferMoney(recipientIdentifier, amount as number);
                resultMessage = result.message;
                resultForModel = result;
            } else if (call.name === 'getCardStatementDetails') {
                const card = findCard(call.args.cardLast4 as string);
                if (card) {
                    resultMessage = `Your ${card.cardType} ending in ${card.cardNumber.slice(-4)} has a statement balance of ${formatCurrency(card.statementBalance)}. The minimum payment is ${formatCurrency(card.minimumPayment)}, due on ${formatDate(card.paymentDueDate)}.`;
                    resultForModel = { ...card, transactions: undefined }; // Don't send all transactions back
                } else {
                    resultMessage = "Card not found.";
                    resultForModel = { success: false, message: resultMessage };
                }
            } else if (call.name === 'getCardTransactions') {
                const card = findCard(call.args.cardLast4 as string);
                const limit = (call.args.limit as number) || 5;
                if (card) {
                    const recentTxs = card.transactions.slice(0, limit);
                    const txSummary = recentTxs.map(tx => `- ${tx.description}: ${formatCurrency(tx.amount)} on ${formatDate(tx.timestamp)}`).join('\n');
                    resultMessage = `Here are the latest ${limit} transactions for your card ending in ${card.cardNumber.slice(-4)}:\n${txSummary}`;
                    resultForModel = { transactions: recentTxs };
                } else {
                    resultMessage = "Card not found.";
                    resultForModel = { success: false, message: resultMessage };
                }
            } else if (call.name === 'getAccountBalance') {
                const savingsBalance = currentUser.balance;
                const totalCardBalance = currentUser.cards.reduce((sum, card) => sum + card.creditBalance, 0);
                const totalLoanBalance = currentUser.loans.reduce((sum, loan) => sum + loan.remainingBalance, 0);

                resultMessage = `Here's your balance summary:\n- Savings: ${formatCurrency(savingsBalance)}\n- Total Card Debt: ${formatCurrency(totalCardBalance)}\n- Total Loan Debt: ${formatCurrency(totalLoanBalance)}`;
                resultForModel = { 
                    success: true, 
                    savingsBalance,
                    totalCardBalance,
                    totalLoanBalance,
                };
            } else if (call.name === 'getAccountTransactions') {
                const limit = (call.args.limit as number) || 5;
                const userTransactions = transactions
                    .filter(tx => tx.userId === currentUser.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, limit);

                if (userTransactions.length > 0) {
                    const txSummary = userTransactions.map(tx => `- ${tx.type === 'credit' ? '+' : '-'}${formatCurrency(tx.amount)} for "${tx.description}" on ${formatDate(tx.timestamp)}`).join('\n');
                    resultMessage = `Here are your last ${userTransactions.length} savings account transactions:\n${txSummary}`;
                    resultForModel = { success: true, transactions: userTransactions };
                } else {
                    resultMessage = "You have no transactions in your savings account.";
                    resultForModel = { success: true, transactions: [] };
                }
            } else if (call.name === 'makeAccountPayment') {
                const { accountId, accountType, paymentType, amount } = call.args;
                const result = makeAccountPayment(accountId as string, accountType as 'card' | 'loan', paymentType as 'minimum' | 'statement' | 'full' | 'custom', amount as number | undefined);
                resultMessage = result.message;
                resultForModel = result;
            } else if (call.name === 'requestPaymentExtension') {
                const { accountId, accountType } = call.args;
                const result = requestPaymentExtension(accountId as string, accountType as 'card' | 'loan');
                resultMessage = result.message;
                resultForModel = result;
            } else if (call.name === 'applyForCreditCard') {
                const applicationDetailsFromAI = call.args.applicationDetails as Omit<CardApplicationDetails, 'fullName'>;
                const result = addCardToUser({ ...applicationDetailsFromAI, fullName: currentUser.name });
                resultMessage = result.message;
                resultForModel = result;
            } else if (call.name === 'applyForLoan') {
                const applicationDetailsFromAI = call.args.applicationDetails as Omit<LoanApplicationDetails, 'fullName' | 'loanTerm'>;
                const loanDetails = {
                    ...applicationDetailsFromAI,
                    fullName: currentUser.name,
                    loanTerm: 36, // Retaining original hardcoded behavior
                };
                const result = addLoanToUser(loanDetails);
                resultMessage = result.message;
                resultForModel = result;
            } else if (call.name === 'getSpendingAnalysis') {
                // period is not used, but could be implemented to filter transactions by date
                const allUserTransactions = [
                    ...transactions.filter(tx => tx.userId === currentUser.id),
                    ...currentUser.cards.flatMap(c => c.transactions)
                ];
                
                const analysisResult = await analyzeSpendingWithAI(allUserTransactions, language);

                if (analysisResult.length === 0) {
                     resultMessage = "You have no spending data to analyze for this period.";
                     resultForModel = { total: 0, breakdown: [] };
                } else {
                    const total = analysisResult.reduce((sum, item) => sum + item.value, 0);
                    resultMessage = `Based on my analysis, you've spent a total of ${formatCurrency(total)} recently. Here's the breakdown:\n` +
                        analysisResult.map(item => `- ${item.name}: ${formatCurrency(item.value)}`).join('\n');
                    resultForModel = { total, breakdown: analysisResult.map(item => ({ category: item.name, amount: item.value })) };
                }
            }

            const systemMessage: Message = { id: messageId.current++, sender: 'system', text: resultMessage };
            setMessages(prev => [...prev, systemMessage]);

            functionResponseParts.push({
                functionResponse: {
                    name: call.name,
                    response: resultForModel,
                }
            });
        }
        
        const finalResponse = await chat.sendMessage({ message: functionResponseParts });
        if (finalResponse.text) {
            const aiMessage: Message = { id: messageId.current++, sender: 'ai', text: finalResponse.text };
            setMessages(prev => [...prev, aiMessage]);
        }

      } else {
        const aiResponse: Message = { id: messageId.current++, sender: 'ai', text: response.text };
        setMessages(prev => [...prev, aiResponse]);
      }

    } catch (error) {
        console.error("Error during AI chat:", error);
        const errorMessage: Message = { id: messageId.current++, sender: 'system', text: t('chatError') };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  useEffect(() => {
      if (!recognition) return;

      recognition.onresult = (event: any) => {
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + ' ';
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        finalTranscriptRef.current = finalTranscript;
        setInputValue(finalTranscript + interimTranscript);
        
        speechTimeoutRef.current = window.setTimeout(() => {
            manualStopRef.current = false;
            recognition.stop();
        }, 1500); // 1.5s pause to send
      };

      recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event);
          setIsListening(false);
      };

      recognition.onend = () => {
          if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
          }
          setIsListening(false);
          const transcript = finalTranscriptRef.current.trim();

          if (!manualStopRef.current && transcript) {
              handleSendRef.current(transcript);
          }
          finalTranscriptRef.current = '';
      };

      return () => {
        if (recognition) {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
        }
      }
  }, []);

  const toggleListening = () => {
    if (!recognition) return alert("Sorry, your browser doesn't support speech recognition.");
    
    if (isListening) {
        manualStopRef.current = false;
        recognition.stop();
    } else {
        setInputValue('');
        finalTranscriptRef.current = '';
        recognition.start();
        setIsListening(true);
    }
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setShowImageOptions(false);
    setIsLoading(true);
    setMessages(prev => [...prev, { id: messageId.current++, sender: 'system', text: t('analyzingImage') }]);

    try {
        const base64Image = await fileToBase64(file);
        const details = await extractPaymentDetailsFromImage(base64Image);

        if (!details.recipientName && !details.recipientAccountNumber) {
             setMessages(prev => [...prev, { id: messageId.current++, sender: 'system', text: t('ocrFailed') }]);
             return;
        }

        const confirmationText = t('ocrSuccess', {
            amount: formatCurrency(details.amount || 0),
            recipient: details.recipientName || details.recipientAccountNumber,
        });

        setMessages(prev => [...prev, { id: messageId.current++, sender: 'system', text: confirmationText }]);
        
        const recipientIdentifier = details.recipientAccountNumber || details.recipientName;
        await handleSend(t('ocrPaymentPrompt', { amount: String(details.amount), recipient: recipientIdentifier }));

    } catch (error) {
        console.error("Error processing image:", error);
        setMessages(prev => [...prev, { id: messageId.current++, sender: 'system', text: t('ocrError') }]);
    } finally {
        setIsLoading(false);
        event.target.value = '';
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      handleSend(inputValue);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: "0%" }} exit={{ y: "100%" }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-slate-900 w-full max-w-2xl h-[85vh] rounded-t-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-6 h-6 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">{t('aiAssistant')}</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
            </header>
            
            <div className="flex-grow p-4 overflow-y-auto">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 grid place-items-center"><SparklesIcon className="w-5 h-5 text-white" /></div>}
                    <div className={`max-w-xs md:max-w-md p-3 rounded-2xl ${
                      msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' :
                      msg.sender === 'ai' ? 'bg-slate-700 text-slate-200 rounded-bl-none' :
                      'bg-slate-800 text-slate-400 text-sm italic w-full text-center'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                    <motion.div className="flex items-end gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 grid place-items-center"><SparklesIcon className="w-5 h-5 text-white" /></div>
                        <div className="bg-slate-700 text-slate-200 p-3 rounded-2xl rounded-bl-none">
                            <div className="flex gap-1.5 items-center">
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-0"></span>
                                 <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            <AnimatePresence>
                {showImageOptions && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center"
                        onClick={() => setShowImageOptions(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                            className="bg-slate-800 rounded-2xl p-4 w-64 space-y-2"
                        >
                            <button onClick={() => photoInputRef.current?.click()} className="w-full text-left p-3 rounded-lg hover:bg-slate-700">{t('takePhoto')}</button>
                            <button onClick={() => uploadInputRef.current?.click()} className="w-full text-left p-3 rounded-lg hover:bg-slate-700">{t('uploadImage')}</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleFormSubmit} className="p-4 border-t border-slate-700 flex-shrink-0 flex items-center gap-2">
                <input type="file" accept="image/*" capture="environment" ref={photoInputRef} onChange={handleImageFileChange} className="hidden" />
                <input type="file" accept="image/*" ref={uploadInputRef} onChange={handleImageFileChange} className="hidden" />
                
                <motion.button
                    type="button"
                    onClick={() => setShowImageOptions(true)}
                    disabled={isLoading}
                    className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 transition-colors duration-200 text-white bg-slate-700 hover:bg-slate-600"
                >
                    <CameraIcon className="w-6 h-6" />
                </motion.button>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={isListening ? t('listening') : t('askNova')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={isLoading}
                />
                <motion.button
                    type="button"
                    onClick={toggleListening}
                    disabled={isLoading}
                    className={`w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 transition-colors duration-200 text-white ${isListening ? 'bg-red-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                    <MicrophoneIcon className="w-6 h-6" />
                </motion.button>
                <motion.button
                    type="submit"
                    disabled={isLoading || !inputValue.trim()}
                    className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-700 disabled:opacity-50"
                >
                    <SendIcon className="w-6 h-6" />
                </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};