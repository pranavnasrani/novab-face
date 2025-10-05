import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { allFunctionDeclarations, createChatSession, extractPaymentDetailsFromImage, getComprehensiveInsights } from '../services/geminiService';
import { BankContext, CardApplicationDetails, LoanApplicationDetails } from '../App';
import { SparklesIcon, MicrophoneIcon, SendIcon, CameraIcon, XCircleIcon } from './icons';
import { Chat, LiveServerMessage, Modality, Blob as GenAI_Blob, LiveSession } from '@google/genai';
import { Transaction, Card, Loan, User } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

function createBlob(data: Float32Array): GenAI_Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}


interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  id: number;
  sender: 'user' | 'ai' | 'system';
  text: string;
};

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

const promptContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3, 
    },
  },
};

const promptItemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100 },
  },
};

const suggestionPrompts = [
  'prompt1', 'prompt2', 'prompt3', 'prompt4'
];

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, transactions, verifyCurrentUserWithPasskey, ai } = useContext(BankContext);
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);
  
  // Voice Mode State
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [voiceConnectionState, setVoiceConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [liveTranscript, setLiveTranscript] = useState({ user: '', model: '' });
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextStartTimeRef = useRef(0);
  const localUserTranscriptRef = useRef('');
  const localModelTranscriptRef = useRef('');

  useEffect(() => {
    const fetchUsers = async () => {
        if (isOpen && currentUser) {
            setContactsLoaded(false);
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("uid", "!=", currentUser.uid));
            const querySnapshot = await getDocs(q);
            const userNames = querySnapshot.docs.map(doc => doc.data().name);
            setContacts(userNames);
            setContactsLoaded(true);
        } else if (!isOpen) {
            setContacts([]);
            setContactsLoaded(false);
        }
    };
    fetchUsers();
  }, [isOpen, currentUser]);
  
  useEffect(() => {
    if (isOpen && currentUser && contactsLoaded && !chat) {
        setMessages([{ id: messageId.current++, sender: 'ai', text: t('chatGreeting', { name: currentUser?.name.split(' ')[0] })}]);
        setInputValue('');
        setChat(createChatSession(currentUser.name, contacts, language, currentUser.cards, currentUser.loans));
    } else if (!isOpen) {
        setChat(null);
        if (isVoiceModeActive) {
            stopVoiceSession();
        }
    }
  }, [isOpen, currentUser, language, contacts, contactsLoaded]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup voice session on modal close
  useEffect(() => {
      return () => {
          if (isVoiceModeActive) {
              stopVoiceSession();
          }
      };
  }, [isVoiceModeActive]);


  const handleFunctionCall = async (call: { name: string, args: any }): Promise<{ success: boolean; message: string; resultForModel: object }> => {
      let resultMessage = "An unknown function was called.";
      let resultForModel: object = { success: false, message: 'Function not found' };

      if (!currentUser) return { success: false, message: "User not logged in.", resultForModel: { success: false, message: "User not logged in."} };

      const findCard = (last4?: string) => {
          if (!last4) return currentUser.cards[0];
          return currentUser.cards.find(c => c.cardNumber.slice(-4) === last4);
      }

      if (call.name === 'initiatePayment') {
          const { recipientName, recipientAccountNumber, recipientEmail, recipientPhone, amount } = call.args;
          const recipientIdentifier = (recipientAccountNumber || recipientEmail || recipientPhone || recipientName) as string;
          const result = await transferMoney(recipientIdentifier, amount as number);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'getCardStatementDetails') {
          const card = findCard(call.args.cardLast4 as string);
          if (card) {
              resultMessage = `Your ${card.cardType} ending in ${card.cardNumber.slice(-4)} has a statement balance of ${formatCurrency(card.statementBalance)}. The minimum payment is ${formatCurrency(card.minimumPayment)}, due on ${formatDate(card.paymentDueDate)}.`;
              resultForModel = { ...card, transactions: undefined };
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
          resultForModel = { success: true, savingsBalance, totalCardBalance, totalLoanBalance };
      } else if (call.name === 'getAccountTransactions') {
          const limit = (call.args.limit as number) || 5;
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
          const { accountId, accountType, paymentType, amount } = call.args;
          const result = await makeAccountPayment(accountId as string, accountType as 'card' | 'loan', paymentType as 'minimum' | 'statement' | 'full' | 'custom', amount as number | undefined);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'requestPaymentExtension') {
          const { accountId, accountType } = call.args;
          const result = await requestPaymentExtension(accountId as string, accountType as 'card' | 'loan');
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'applyForCreditCard') {
          const applicationDetailsFromAI = call.args.applicationDetails as Omit<CardApplicationDetails, 'fullName'>;
          const result = await addCardToUser({ ...applicationDetailsFromAI, fullName: currentUser.name });
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'applyForLoan') {
          const applicationDetailsFromAI = call.args.applicationDetails as Omit<LoanApplicationDetails, 'fullName' | 'loanTerm'>;
          const loanDetails = { ...applicationDetailsFromAI, fullName: currentUser.name, loanTerm: 36 };
          const result = await addLoanToUser(loanDetails);
          resultMessage = result.message;
          resultForModel = result;
      } else if (call.name === 'getSpendingAnalysis') {
          const allUserTransactions = [ ...transactions, ...currentUser.cards.flatMap(c => c.transactions) ];
          const analysisResultObject = await getComprehensiveInsights(allUserTransactions, language);
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
      }

      return { success: (resultForModel as any).success, message: resultMessage, resultForModel };
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
    }
  };

  const stopVoiceSession = async () => {
    setIsVoiceModeActive(false);
    setVoiceConnectionState('idle');

    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch (e) { console.error("Error closing session:", e); }
    }
    
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    sessionPromiseRef.current = null;
    localUserTranscriptRef.current = '';
    localModelTranscriptRef.current = '';
    setLiveTranscript({ user: '', model: '' });
  };

  const startVoiceSession = async () => {
      if (!currentUser || !ai) return;
      setIsVoiceModeActive(true);
      setVoiceConnectionState('connecting');

      try {
          // @ts-ignore
          inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          // @ts-ignore
          outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });

          if (inputAudioContextRef.current.state === 'suspended') {
              await inputAudioContextRef.current.resume();
          }
          if (outputAudioContextRef.current.state === 'suspended') {
              await outputAudioContextRef.current.resume();
          }

          mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

          sessionPromiseRef.current = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-09-2025',
              callbacks: {
                  onopen: () => {
                      setVoiceConnectionState('connected');
                      const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                      scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                          const pcmBlob = createBlob(inputData);
                          sessionPromiseRef.current?.then((session) => {
                              session.sendRealtimeInput({ media: pcmBlob });
                          });
                      };
                      source.connect(scriptProcessorRef.current);
                      scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                  },
                  onmessage: async (message: LiveServerMessage) => {
                      // Audio
                      const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                      if (base64Audio) {
                          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime);
                          const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current!, 24000, 1);
                          const source = outputAudioContextRef.current!.createBufferSource();
                          source.buffer = audioBuffer;
                          source.connect(outputAudioContextRef.current!.destination);
                          source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
                          source.start(nextStartTimeRef.current);
                          nextStartTimeRef.current += audioBuffer.duration;
                          audioSourcesRef.current.add(source);
                      }
                      
                      // Transcription
                      if (message.serverContent?.inputTranscription) {
                          localUserTranscriptRef.current += message.serverContent.inputTranscription.text;
                          setLiveTranscript({ user: localUserTranscriptRef.current, model: localModelTranscriptRef.current });
                      } else if (message.serverContent?.outputTranscription) {
                          localModelTranscriptRef.current += message.serverContent.outputTranscription.text;
                          setLiveTranscript({ user: localUserTranscriptRef.current, model: localModelTranscriptRef.current });
                      }

                      // Turn Completion
                      if (message.serverContent?.turnComplete) {
                          const userText = localUserTranscriptRef.current.trim();
                          const modelText = localModelTranscriptRef.current.trim();
                          if (userText) setMessages(prev => [...prev, { id: messageId.current++, sender: 'user', text: userText }]);
                          if (modelText) setMessages(prev => [...prev, { id: messageId.current++, sender: 'ai', text: modelText }]);
                          localUserTranscriptRef.current = ''; localModelTranscriptRef.current = '';
                          setLiveTranscript({ user: '', model: '' });
                      }
                      
                      // Tool Calls
                      if (message.toolCall) {
                        for (const call of message.toolCall.functionCalls) {
                            const { message, resultForModel } = await handleFunctionCall(call);
                            sessionPromiseRef.current?.then(session => {
                                session.sendToolResponse({
                                    functionResponses: { id: call.id, name: call.name, response: { result: message } }
                                });
                            });
                        }
                      }

                      // Interruption
                      if (message.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(source => source.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                      }
                  },
                  onerror: (e: ErrorEvent) => {
                      console.error('Live session error:', e);
                      setVoiceConnectionState('error');
                      stopVoiceSession();
                  },
                  onclose: () => { stopVoiceSession(); },
              },
              config: {
                  responseModalities: [Modality.AUDIO],
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                  tools: [{ functionDeclarations: allFunctionDeclarations }]
              },
          });
      } catch (error) {
          console.error("Failed to start voice session:", error);
          setVoiceConnectionState('error');
          stopVoiceSession();
      }
  };

  const toggleVoiceMode = () => {
    if (isVoiceModeActive) {
        stopVoiceSession();
    } else {
        startVoiceSession();
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

  const getVoiceModePlaceholder = () => {
      switch(voiceConnectionState) {
          case 'connecting': return t('connecting');
          case 'connected': return liveTranscript.user ? liveTranscript.user : t('speakNow');
          case 'error': return t('chatError');
          default: return t('askNova');
      }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: "0%" }} exit={{ y: "100%" }}
            transition={{ type: 'spring', damping: 30, stiffness: 220, mass: 0.9 }}
            className="bg-slate-900 w-full h-[85vh] rounded-t-3xl flex flex-col overflow-hidden absolute bottom-0"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
                className="absolute -bottom-1/4 left-1/2 -translate-x-1/2 w-[150%] aspect-square rounded-full bg-gradient-radial from-indigo-500/20 via-indigo-500/5 to-transparent pointer-events-none"
                initial={{ scale: 0, y: 150 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
                className="relative z-10 flex flex-col w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.4 }}
            >
              <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-6 h-6 text-indigo-400" />
                  <h2 className="text-lg font-bold text-white">{isVoiceModeActive ? t('voiceMode') : t('aiAssistant')}</h2>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
              </header>
              
              <div className="flex-grow p-4 overflow-y-auto flex flex-col">
                <div className="space-y-4 mt-auto">
                    {messages.length === 1 && !isLoading && !isVoiceModeActive && (
                        <motion.div
                            variants={promptContainerVariants}
                            initial="hidden"
                            animate="visible"
                            className="pb-4"
                        >
                            <div className="flex items-center gap-2 justify-center mb-3">
                                <SparklesIcon className="w-4 h-4 text-indigo-400" />
                                <h3 className="text-sm font-semibold text-slate-400">{t('suggestivePromptsTitle')}</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {suggestionPrompts.map((promptKey) => (
                                    <motion.button
                                        key={promptKey}
                                        variants={promptItemVariants}
                                        onClick={() => handleSend(t(promptKey as any))}
                                        className="p-3 text-left bg-slate-800 rounded-xl text-sm text-slate-300 hover:bg-slate-700 transition-colors duration-200"
                                    >
                                        {t(promptKey as any)}
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}
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
                  {isLoading && !isVoiceModeActive && (
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
                              <button onClick={() => photoInputRef.current?.click()} className="w-full text-left p-3 rounded-lg hover:bg-slate-700 text-white">{t('takePhoto')}</button>
                              <button onClick={() => uploadInputRef.current?.click()} className="w-full text-left p-3 rounded-lg hover:bg-slate-700 text-white">{t('uploadImage')}</button>
                          </motion.div>
                      </motion.div>
                  )}
              </AnimatePresence>

               <div className="p-4 border-t border-slate-700 flex-shrink-0">
                    <AnimatePresence mode="wait">
                    {isVoiceModeActive ? (
                        <motion.div key="voice-view" initial={{ opacity: 0, y:10 }} animate={{ opacity: 1, y:0 }} exit={{ opacity: 0, y:10 }} className="flex flex-col items-center gap-2 h-[88px] justify-center">
                            <p className="text-indigo-300 text-sm h-5">{liveTranscript.model}</p>
                            <p className="text-slate-200 font-medium h-6 text-center">{getVoiceModePlaceholder()}</p>
                            <button onClick={stopVoiceSession} className="text-sm text-slate-400 hover:text-white">{t('tapToStop')}</button>
                        </motion.div>
                    ) : (
                        <motion.form key="text-view" initial={{ opacity: 0, y:10 }} animate={{ opacity: 1, y:0 }} exit={{ opacity: 0, y:10 }} onSubmit={handleFormSubmit} className="flex items-center gap-2">
                             <input type="file" accept="image/*" capture="environment" ref={photoInputRef} onChange={handleImageFileChange} className="hidden" />
                            <input type="file" accept="image/*" ref={uploadInputRef} onChange={handleImageFileChange} className="hidden" />
                            <motion.button type="button" onClick={() => setShowImageOptions(true)} disabled={isLoading} className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 transition-colors duration-200 text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50">
                                <CameraIcon className="w-6 h-6" />
                            </motion.button>
                            <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={t('askNova')} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isLoading} />
                            <motion.button type="submit" disabled={isLoading || !inputValue.trim()} className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-700 disabled:opacity-50">
                                <SendIcon className="w-6 h-6" />
                            </motion.button>
                        </motion.form>
                     )}
                    </AnimatePresence>
                    <motion.button
                        onClick={toggleVoiceMode}
                        disabled={isLoading && !isVoiceModeActive}
                        className={`w-16 h-16 rounded-full grid place-items-center flex-shrink-0 transition-all duration-300 text-white absolute right-4 bottom-24 shadow-lg ${isVoiceModeActive ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                        animate={{ scale: isVoiceModeActive && voiceConnectionState === 'connected' ? 1.1 : 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 10, repeat: isVoiceModeActive ? Infinity : 0, repeatType: 'reverse' }}
                    >
                         {isVoiceModeActive ? <XCircleIcon className="w-8 h-8" /> : <MicrophoneIcon className="w-8 h-8" />}
                    </motion.button>
               </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};