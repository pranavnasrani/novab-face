

import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createChatSession, extractPaymentDetailsFromImage, getComprehensiveInsights } from '../services/geminiService';
import { BankContext, CardApplicationDetails, LoanApplicationDetails } from '../App';
import { SparklesIcon, SendIcon, CameraIcon, MicrophoneIcon } from './icons';
import { Chat } from '@google/genai';
import { useTranslation } from '../hooks/useTranslation';
import { db } from '../services/firebase';

// FIX: Add type definition for the non-standard `SpeechRecognition` Web API to resolve TypeScript errors.
interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  abort: () => void;
  // FIX: Add the missing `stop` method to the `SpeechRecognition` interface definition.
  stop: () => void;
  onresult: (event: any) => void;
  onend: () => void;
  onerror: (event: any) => void;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Helper to render bold/italic text
const renderLine = (line: string) => {
  // Split by bold (**...**) or italic (*...*) markers. The filter(Boolean) removes empty strings from the result.
  const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g).filter(Boolean);
  return parts.map((part, partIndex) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={partIndex}>{part.slice(1, -1)}</em>;
    }
    return part; // Return plain text part
  });
};

const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      const ListComponent = listType === 'ul' ? 'ul' : 'ol';
      elements.push(
        <ListComponent key={`list-${elements.length}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} list-outside pl-5 space-y-1`}>
          {listItems}
        </ListComponent>
      );
      listItems = [];
    }
    listType = null;
  };

  lines.forEach((line, index) => {
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={index}>{renderLine(ulMatch[1])}</li>);
      return;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={index}>{renderLine(olMatch[2])}</li>);
      return;
    }
    
    flushList(); // End any list if the current line is not a list item.
    if (line.trim()) {
      elements.push(<p key={index}>{renderLine(line)}</p>); // Render non-empty lines as paragraphs.
    }
  });

  flushList(); // Flush any list that extends to the end of the text.

  return <div className="text-sm space-y-2">{elements}</div>;
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

const suggestionPrompts = [
  'prompt1', 'prompt2', 'prompt3', 'prompt4'
];

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  id: number;
  sender: 'user' | 'ai' | 'system';
  text: string;
};

const langCodeMap: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  th: 'th-TH',
  tl: 'tl-PH',
};

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, transactions, verifyCurrentUserWithPasskey, showToast, ai, insightsData, loadOrGenerateInsights } = useContext(BankContext);
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);
  
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const inputValueRef = useRef(inputValue);
  const isVoiceModeRef = useRef(isVoiceMode);
  
  useEffect(() => {
      inputValueRef.current = inputValue;
  }, [inputValue]);
  
  useEffect(() => {
      isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  const handleFunctionCall = async (call: { name?: string, args?: any }): Promise<{ success: boolean; message: string; resultForModel: object }> => {
      if (!call.name) {
          const message = "Tool call received without a function name.";
          return { success: false, message, resultForModel: { success: false, error: message } };
      }
      let resultMessage = "An unknown function was called.";
      let resultForModel: object = { success: false, message: 'Function not found' };

      if (!currentUser) return { success: false, message: "User not logged in.", resultForModel: { success: false, message: "User not logged in."} };

      const args = call.args || {};

      const findCard = (last4?: string) => {
          if (!last4) return currentUser.cards[0];
          return currentUser.cards.find(c => c.cardNumber.slice(-4) === last4);
      }

      if (call.name === 'initiatePayment') {
          const { recipientName, recipientAccountNumber, recipientEmail, recipientPhone, amount } = args;
          const recipientIdentifier = (recipientAccountNumber || recipientEmail || recipientPhone || recipientName) as string;
          const result = await transferMoney(recipientIdentifier, amount as number);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'getCardStatementDetails') {
          const card = findCard(args.cardLast4 as string);
          if (card) {
              resultMessage = `Your ${card.cardType} ending in ${card.cardNumber.slice(-4)} has a statement balance of ${formatCurrency(card.statementBalance)}. The minimum payment is ${formatCurrency(card.minimumPayment)}, due on ${formatDate(card.paymentDueDate)}.`;
              resultForModel = { ...card, transactions: undefined };
          } else {
              resultMessage = "Card not found.";
              resultForModel = { success: false, message: resultMessage };
          }
      } else if (call.name === 'getCardTransactions') {
          const card = findCard(args.cardLast4 as string);
          const limit = (args.limit as number) || 5;
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
          resultForModel = { success: true, savingsBalance, totalCardBalance, totalLoanBalance };
      } else if (call.name === 'getAccountTransactions') {
          const limit = (args.limit as number) || 5;
          const userTransactions = transactions.slice(0, limit);
          if (userTransactions.length > 0) {
              const txSummary = userTransactions.map(tx => `- ${tx.type === 'credit' ? '+' : '-'}${formatCurrency(tx.amount)} for "${tx.description}" on ${formatDate(tx.timestamp)}`).join('\n');
              resultMessage = `Here are your last ${userTransactions.length} savings account transactions:\n${txSummary}`;
              resultForModel = { success: true, transactions: userTransactions };
          } else {
              resultMessage = "You have no transactions in your savings account.";
              resultForModel = { success: true, transactions: [] };
          }
      } else if (call.name === 'makeAccountPayment') {
          const { accountId, accountType, paymentType, amount } = args;
          const result = await makeAccountPayment(accountId as string, accountType as 'card' | 'loan', paymentType as 'minimum' | 'statement' | 'full' | 'custom', amount as number | undefined);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'requestPaymentExtension') {
          const { accountId, accountType } = args;
          const result = await requestPaymentExtension(accountId as string, accountType as 'card' | 'loan');
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'applyForCreditCard') {
          const applicationDetailsFromAI = args.applicationDetails as Omit<CardApplicationDetails, 'fullName'>;
          const result = await addCardToUser({ ...applicationDetailsFromAI, fullName: currentUser.name });
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'applyForLoan') {
          const applicationDetailsFromAI = args.applicationDetails as Omit<LoanApplicationDetails, 'fullName'>;
          const loanDetails = { ...applicationDetailsFromAI, fullName: currentUser.name };
          const result = await addLoanToUser(loanDetails);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'getSpendingAnalysis') {
          resultMessage = "I'm generating your first spending analysis. This might take a moment...";
          const cachedInsights = await loadOrGenerateInsights();
          const analysisResultObject = cachedInsights?.data?.[language];

          if (!analysisResultObject || analysisResultObject.spendingBreakdown.length === 0) {
               resultMessage = "You have no spending data to analyze for this period.";
               resultForModel = { total: 0, breakdown: [] };
          } else {
              const analysisResult = analysisResultObject.spendingBreakdown;
              const total = analysisResult.reduce((sum, item) => sum + item.value, 0);
              resultMessage = `Based on my analysis, you've spent a total of ${formatCurrency(total)} recently. Here's the breakdown:\n` +
                  analysisResult.map(item => `- ${item.name}: ${formatCurrency(item.value)}`).join('\n');
              resultForModel = { total, breakdown: analysisResult };
          }
      } else if (call.name === 'getExistingSpendingInsights') {
            const insightsForCurrentLanguage = insightsData?.data?.[language];
            if (insightsForCurrentLanguage) {
                const insights = insightsForCurrentLanguage;
                const totalSpending = insights.spendingBreakdown.reduce((sum, item) => sum + item.value, 0);
                resultMessage = `Here are your latest spending insights:\nYou've spent a total of ${formatCurrency(totalSpending)} recently. The top categories are ${insights.spendingBreakdown.slice(0, 2).map(item => item.name).join(', ')}. Your overall spending has changed by ${insights.overallSpendingChange.toFixed(1)}% compared to the last period. Would you like more details?`;
                resultForModel = { success: true, insights: insights };
            } else {
                resultMessage = "I'm generating your first spending analysis. This might take a moment...";
                // This message is for the user. Now, we tell the model what to do.
                resultForModel = { success: false, message: "No cached insights found. Please use the 'getSpendingAnalysis' tool to generate them now." };
            }
        }

      return { success: (resultForModel as any).success, message: resultMessage, resultForModel };
  };

  const startListening = () => {
      if (recognitionRef.current) {
          if (speechTimeoutRef.current) {
              clearTimeout(speechTimeoutRef.current);
              speechTimeoutRef.current = null;
          }
          setInputValue('');
          setIsListening(true);
          recognitionRef.current.start();
      }
  };

  const handleSend = async (prompt: string) => {
    if (!prompt.trim() || isLoading || !currentUser || !chat) return;
    
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
            const sensitiveActions = ['initiatePayment', 'makeAccountPayment', 'applyForCreditCard', 'applyForLoan', 'requestPaymentExtension'];
            if (sensitiveActions.includes(call.name)) {
                const systemMessage: Message = { id: messageId.current++, sender: 'system', text: t('passkeyConfirmationRequired', { action: call.name }) };
                setMessages(prev => [...prev, systemMessage]);

                const isVerified = await verifyCurrentUserWithPasskey();

                if (!isVerified) {
                    const cancelledMessage: Message = { id: messageId.current++, sender: 'system', text: t('actionCancelled') };
                    setMessages(prev => [...prev, cancelledMessage]);
                    functionResponseParts.push({
                        functionResponse: {
                            name: call.name,
                            response: { success: false, message: 'User cancelled the action with their passkey.' },
                        }
                    });
                    continue; 
                }
            }

            const { message, resultForModel } = await handleFunctionCall(call);

            const systemMessage: Message = { id: messageId.current++, sender: 'system', text: message };
            setMessages(prev => [...prev, systemMessage]);

            functionResponseParts.push({
                functionResponse: { name: call.name, response: resultForModel }
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
        if (isVoiceModeRef.current) {
            startListening();
        }
    }
  };
  
  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  const toggleListening = () => {
    if (isListening) {
      setIsVoiceMode(false);
      recognitionRef.current?.abort();
    } else {
      setIsVoiceMode(true);
      startListening();
    }
  };

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        console.warn("Speech recognition not supported in this browser.");
        return;
    }
    
    const recognition = new SpeechRecognitionAPI();
    recognition.interimResults = true;
    recognition.lang = langCodeMap[language] || language;
    recognition.continuous = false;

    const clearSpeechTimeout = () => {
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
            speechTimeoutRef.current = null;
        }
    };

    recognition.onresult = (event) => {
        clearSpeechTimeout();

        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        const transcriptToSet = finalTranscript.trim() || interimTranscript.trim();
        setInputValue(transcriptToSet);
        
        speechTimeoutRef.current = window.setTimeout(() => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        }, 1200);
    };

    recognition.onend = () => {
        clearSpeechTimeout();
        setIsListening(false);
        const finalTranscript = inputValueRef.current.trim();
        
        if (finalTranscript) {
            handleSendRef.current(finalTranscript);
        } else {
            // If recognition ends with no result, exit voice mode.
            setIsVoiceMode(false);
        }
    };
    
    recognition.onerror = (event) => {
        clearSpeechTimeout();
        setIsListening(false);
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            showToast(t('voiceError'), 'error');
        }
    };

    recognitionRef.current = recognition;

    return () => {
        clearSpeechTimeout();
        recognition.abort();
    }
  }, [language, showToast, t]);
  
  useEffect(() => {
    if (isOpen && currentUser && !chat) {
        setChat(null); // Reset chat session when modal opens
        messageId.current = 0;
        setMessages([{ id: messageId.current++, sender: 'ai', text: t('chatGreeting', { name: currentUser?.name.split(' ')[0] })}]);
        setInputValue('');
        setChat(createChatSession(currentUser.name, language, currentUser.cards, currentUser.loans));
    } else if (!isOpen) {
        setChat(null); // Clear chat session when modal closes
        if (isListening) {
            setIsListening(false);
            setIsVoiceMode(false);
            recognitionRef.current?.abort();
        }
    }
  }, [isOpen, currentUser, language]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
      setIsVoiceMode(false);
      handleSend(inputValue);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "100%" }}
            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            className="w-full max-w-md bg-slate-950 rounded-t-3xl flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex-shrink-0 flex justify-center pt-3 pb-2 cursor-grab">
                <div className="w-10 h-1.5 bg-slate-700 rounded-full" />
            </div>
            <header className="flex-shrink-0 px-4 pb-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SparklesIcon className="w-6 h-6 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">{t('aiAssistant')}</h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-2xl">&times;</button>
            </header>
            
            <div className="flex-grow p-4 overflow-y-auto flex flex-col">
              <div className="space-y-4">
                  {messages.length === 1 && !isLoading && (
                      <div className="pb-4">
                          <div className="flex items-center gap-2 justify-center mb-3">
                              <SparklesIcon className="w-4 h-4 text-indigo-400" />
                              <h3 className="text-sm font-semibold text-slate-400">{t('suggestivePromptsTitle')}</h3>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {suggestionPrompts.map((promptKey) => (
                                  <button
                                      key={promptKey}
                                      onClick={() => handleSend(t(promptKey as any))}
                                      className="p-3 text-left bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors duration-200"
                                      disabled={isListening}
                                  >
                                      {t(promptKey as any)}
                                  </button>
                              ))}
                          </div>
                      </div>
                  )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 grid place-items-center"><SparklesIcon className="w-5 h-5 text-indigo-400" /></div>}
                    <div className={`max-w-xs md:max-w-md p-3 rounded-xl ${
                      msg.sender === 'user' ? 'bg-indigo-600 text-white' :
                      msg.sender === 'ai' ? 'bg-slate-800 text-slate-200' :
                      'bg-transparent text-slate-500 text-xs italic w-full text-center'
                    }`}>
                      {msg.sender === 'ai' ? (
                        <MarkdownRenderer text={msg.text} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && !isListening && (
                    <div className="flex items-end gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 grid place-items-center"><SparklesIcon className="w-5 h-5 text-indigo-400" /></div>
                        <div className="bg-slate-800 text-slate-200 p-3 rounded-xl">
                            <div className="flex gap-1.5 items-center">
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-0"></span>
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-950 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
                  <input type="file" accept="image/*" ref={photoInputRef} onChange={handleImageFileChange} className="hidden" />
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isLoading || isListening} className="w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
                      <CameraIcon className="w-6 h-6" />
                  </button>
                  <button type="button" onClick={toggleListening} disabled={isLoading} className={`w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors bg-slate-800 hover:bg-slate-700 disabled:opacity-50 ${isListening ? 'text-blue-400' : 'text-slate-400'}`}>
                      <MicrophoneIcon className="w-6 h-6" />
                  </button>
                  <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={isListening ? t('listening') : t('askNova')} className="w-full bg-slate-800 border-transparent rounded-lg px-4 py-3 h-12 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isLoading || isListening} />
                  <button type="submit" disabled={isLoading || !inputValue.trim() || isListening} className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-800 disabled:text-slate-500 transition-colors">
                      <SendIcon className="w-6 h-6" />
                  </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
