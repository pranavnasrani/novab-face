

import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createChatSession, extractPaymentDetailsFromImage, getComprehensiveInsights, getSystemInstruction, allFunctionDeclarations } from '../services/geminiService';
import { BankContext, CardApplicationDetails, LoanApplicationDetails } from '../App';
import { SparklesIcon, SendIcon, CameraIcon, MicrophoneIcon } from './icons';
import { Chat, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { useTranslation } from '../hooks/useTranslation';
import { db } from '../services/firebase';

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

// --- Audio Helper Functions for Gemini Live API ---

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

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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

function createBlob(data: Float32Array): Blob {
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

// --- End Audio Helper Functions ---


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

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, transactions, verifyCurrentUserWithPasskey, showToast, ai } = useContext(BankContext);
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);
  
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioResourcesRef = useRef<{
      stream: MediaStream | null;
      inputContext: AudioContext | null;
      outputContext: AudioContext | null;
      processor: ScriptProcessorNode | null;
      sources: Set<AudioBufferSourceNode>;
  }>({ stream: null, inputContext: null, outputContext: null, processor: null, sources: new Set() });
  const nextStartTimeRef = useRef(0);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

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
  
  const startVoiceMode = async () => {
    if (!currentUser) return;
    setIsVoiceMode(true);
    setVoiceStatus('connecting');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioResourcesRef.current.stream = stream;

        // FIX: Cast `window` to `any` to allow access to the non-standard `webkitAudioContext` for older Safari browser compatibility, resolving a TypeScript error.
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioResourcesRef.current.inputContext = inputAudioContext;
        audioResourcesRef.current.outputContext = outputAudioContext;
        
        const systemInstruction = getSystemInstruction(currentUser.name, contacts, language, currentUser.cards, currentUser.loans);

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    setVoiceStatus('listening');
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    audioResourcesRef.current.processor = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    // Handle Transcription
                    if (message.serverContent?.inputTranscription) {
                        setInputValue(currentInputTranscriptionRef.current + message.serverContent.inputTranscription.text);
                        if(message.serverContent.inputTranscription.isFinal) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        }
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                    }

                    // Handle Tool Calls
                    if (message.toolCall) {
                        for (const call of message.toolCall.functionCalls) {
                            // No passkey check needed in voice mode for now, to keep it fluid
                            const { resultForModel } = await handleFunctionCall(call);
                            sessionPromiseRef.current?.then(session => {
                                session.sendToolResponse({
                                    functionResponses: { id: call.id, name: call.name, response: { result: resultForModel } }
                                });
                            });
                        }
                    }
                    
                    // Handle Audio Output
                    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64EncodedAudioString) {
                        setVoiceStatus('speaking');
                        const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), outputAudioContext, 24000, 1);
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputAudioContext.destination);
                        
                        source.addEventListener('ended', () => {
                            audioResourcesRef.current.sources.delete(source);
                            if (audioResourcesRef.current.sources.size === 0) {
                                setVoiceStatus('listening');
                            }
                        });
                        
                        const currentTime = outputAudioContext.currentTime;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentTime);
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioResourcesRef.current.sources.add(source);
                    }

                    // Handle Turn Completion
                    if (message.serverContent?.turnComplete) {
                        if (currentInputTranscriptionRef.current.trim()) {
                            setMessages(prev => [...prev, { id: messageId.current++, sender: 'user', text: currentInputTranscriptionRef.current.trim() }]);
                        }
                        if (currentOutputTranscriptionRef.current.trim()) {
                             setMessages(prev => [...prev, { id: messageId.current++, sender: 'ai', text: currentOutputTranscriptionRef.current.trim() }]);
                        }
                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                        setInputValue('');
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    showToast(t('voiceError'), 'error');
                    stopVoiceMode();
                },
                onclose: (e: CloseEvent) => {
                    stopVoiceMode();
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                systemInstruction: systemInstruction,
                tools: [{ functionDeclarations: allFunctionDeclarations }],
                outputAudioTranscription: {},
                inputAudioTranscription: {},
            },
        });

    } catch (error) {
        console.error("Failed to start voice mode:", error);
        showToast(t('micAccessDenied'), 'error');
        setIsVoiceMode(false);
        setVoiceStatus('idle');
    }
  };

  const stopVoiceMode = () => {
    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;
    
    audioResourcesRef.current.sources.forEach(source => source.stop());
    audioResourcesRef.current.sources.clear();
    
    audioResourcesRef.current.processor?.disconnect();
    audioResourcesRef.current.inputContext?.close();
    audioResourcesRef.current.outputContext?.close();
    audioResourcesRef.current.stream?.getTracks().forEach(track => track.stop());
    
    audioResourcesRef.current = { stream: null, inputContext: null, outputContext: null, processor: null, sources: new Set() };
    nextStartTimeRef.current = 0;
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    setIsVoiceMode(false);
    setVoiceStatus('idle');
    setInputValue('');
  };

  const toggleVoiceMode = () => {
    if (isVoiceMode) {
        stopVoiceMode();
    } else {
        startVoiceMode();
    }
  };

  useEffect(() => {
    return () => {
        if(isVoiceMode) {
            stopVoiceMode();
        }
    }
  }, []);
  
  useEffect(() => {
    const fetchUsers = async () => {
        if (isOpen && currentUser) {
            setContactsLoaded(false);
            const usersRef = db.collection("users");
            const q = usersRef.where("uid", "!=", currentUser.uid);
            const querySnapshot = await q.get();
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
        messageId.current = 0;
        setMessages([{ id: messageId.current++, sender: 'ai', text: t('chatGreeting', { name: currentUser?.name.split(' ')[0] })}]);
        setInputValue('');
        setChat(createChatSession(currentUser.name, contacts, language, currentUser.cards, currentUser.loans));
    } else if (!isOpen) {
        setChat(null);
        if (isVoiceMode) stopVoiceMode();
    }
  }, [isOpen, currentUser, language, contacts, contactsLoaded]);
  
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
      handleSend(inputValue);
  }

  const getVoiceStatusText = () => {
    switch(voiceStatus) {
        case 'connecting': return t('connecting');
        case 'listening': return t('speakNow');
        case 'speaking': return '...';
        default: return t('askNova');
    }
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
                                      disabled={isVoiceMode}
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
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isLoading && !isVoiceMode && (
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
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isLoading || isVoiceMode} className="w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
                      <CameraIcon className="w-6 h-6" />
                  </button>
                  <button type="button" onClick={toggleVoiceMode} disabled={isLoading && !isVoiceMode} className={`w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors bg-slate-800 hover:bg-slate-700 disabled:opacity-50 ${isVoiceMode ? 'text-blue-400' : 'text-slate-400'}`}>
                      <MicrophoneIcon className="w-6 h-6" />
                  </button>
                  <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={isVoiceMode ? getVoiceStatusText() : t('askNova')} className="w-full bg-slate-800 border-transparent rounded-lg px-4 py-3 h-12 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isLoading || isVoiceMode} />
                  <button type="submit" disabled={isLoading || !inputValue.trim() || isVoiceMode} className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-800 disabled:text-slate-500 transition-colors">
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