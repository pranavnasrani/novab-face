import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { allFunctionDeclarations, createChatSession, extractPaymentDetailsFromImage, getComprehensiveInsights, ai } from '../services/geminiService';
import { BankContext, CardApplicationDetails, LoanApplicationDetails } from '../App';
import { SparklesIcon, SendIcon, CameraIcon, MicrophoneIcon, StopCircleIcon } from './icons';
// FIX: Removed `LiveSession` as it is not an exported member of '@google/genai'.
import { Chat, LiveServerMessage, Modality } from '@google/genai';
import { useTranslation } from '../hooks/useTranslation';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// The Blob type expected by the Gemini API for media objects
interface GeminiBlob {
    data: string;
    mimeType: string;
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

const suggestionPrompts = [
  'prompt1', 'prompt2', 'prompt3', 'prompt4'
];

// Audio helper functions
const encode = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const decode = (base64: string) => {
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

// Inlined AudioWorklet processor code. This is the most robust method as it avoids
// potential server issues with loading an external `audio-processor.js` file.
const audioProcessorCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  process(inputs) {
    const inputChannelData = inputs[0][0];
    if (!inputChannelData) {
      return true;
    }
    const pcmData = new Int16Array(inputChannelData.length);
    for (let i = 0; i < inputChannelData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputChannelData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;

export const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, transferMoney, addCardToUser, addLoanToUser, requestPaymentExtension, makeAccountPayment, transactions, verifyCurrentUserWithPasskey, showToast } = useContext(BankContext);
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
  
  // Voice mode state and refs
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'listening' | 'processing' | 'speaking'>('idle');
  const [liveInputTranscription, setLiveInputTranscription] = useState('');
  const [liveOutputTranscription, setLiveOutputTranscription] = useState('');
  const finalInputTranscription = useRef('');
  const finalOutputTranscription = useRef('');
  
  const sessionId = useRef(0);
  // FIX: Replaced the non-exported `LiveSession` type with an inferred type to resolve the TypeScript error.
  const sessionRef = useRef<Awaited<ReturnType<typeof ai.live.connect>> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());


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
        if (isVoiceMode) {
            stopVoiceMode();
        }
    }
  }, [isOpen, currentUser, language, contacts, contactsLoaded]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const getVoiceSystemInstruction = () => {
    if (!currentUser) return '';
    const langNameMap = { en: 'English', es: 'Spanish', th: 'Thai', tl: 'Tagalog' };
    const langName = langNameMap[language];

    const contactsInstruction = contacts.length > 0
        ? `Available contacts by name are: ${contacts.join(', ')}. If a name doesn't match, inform the user.`
        : "There are no other users registered. If the user asks to send money to someone by name, you must inform them that no contacts were found and they should try an account number, email, or phone instead.";

    const activeLoans = currentUser.loans.filter(l => l.status === 'Active');

    let loanInstructions = '';
    if (activeLoans.length === 0) {
        loanInstructions = "The user has no active loans. If they ask to pay a loan or request an extension, you must inform them they don't have one.";
    } else if (activeLoans.length === 1) {
        loanInstructions = `The user has one active loan. If they want to pay their loan or request an extension, assume it is this one and use its ID: '${activeLoans[0].id}'. You do not need to ask for the loan ID.`;
    } else {
        const loanDescriptions = activeLoans.map((l) => `a loan for $${l.loanAmount} (ID: '${l.id}')`).join('; ');
        loanInstructions = `The user has multiple active loans: ${loanDescriptions}. If the user asks to pay a loan or request an extension, you MUST ask for clarification (e.g., "Which loan would you like to pay? The one for $${activeLoans[0].loanAmount} or..."). Once they specify, you must use the corresponding loan ID for the 'accountId'. Do NOT ask the user for the loan ID directly.`;
    }

    const cardDescriptions = currentUser.cards.length > 0 ? `The user has the following card(s): ${currentUser.cards.map(c => `${c.cardType} ending in ${c.cardNumber.slice(-4)}`).join(', ')}.` : "The user has no credit cards.";


    return `You are a world-class banking voice assistant named Nova for a user named ${currentUser.name}.
Respond concisely and naturally, as you are speaking. All function calling capabilities are available via tools.

1.  **Payments**:
    - If the user asks to "send", "pay", "transfer", or similar, you MUST use the 'initiatePayment' tool.
    - You must have a recipient and an amount. The recipient can be identified by their name, 16-digit account number, email address, or phone number. Prioritize using the account number if provided.
    - ${contactsInstruction} Do not hallucinate contacts.

2.  **Spending Analysis**:
    - If the user asks "how much did I spend", "what's my spending breakdown", "show my expenses", or similar, you MUST use the 'getSpendingAnalysis' tool.
    - This tool uses AI to provide a categorical breakdown of their spending from all their accounts for a given period.

3.  **Card & Account Information**:
    - If the user asks for their "balance," "how much money do I have," or similar, you MUST use the 'getAccountBalance' tool. This provides a full financial overview (savings, card debt, loans).
    - If the user asks about their credit card "bill," "statement," "due date," or "minimum payment," you MUST use the 'getCardStatementDetails' tool.
    - To get recent transactions for a credit card, use 'getCardTransactions'. To get transactions for the main savings account, use 'getAccountTransactions'. If the user just asks for "recent transactions" without specifying, use 'getAccountTransactions'.
    - ${cardDescriptions} If a card is not specified for a card-related query, assume they mean their primary (first) card if they have one.

4.  **Bill & Loan Payments**:
    - If the user wants to "pay my bill," "make a payment," or similar for a card or loan, you MUST use the 'makeAccountPayment' tool.
    - You must clarify the payment amount (e.g., minimum, statement, full, or custom).
    - For card payments, you must provide the last 4 digits of the card number as the \`accountId\`.
    - ${loanInstructions}

5.  **Payment Extensions**:
    - If the user says they "can't pay," "need more time," or asks for an "extension" on a bill or loan, you MUST use the 'requestPaymentExtension' tool.
    - For card extensions, you must provide the last 4 digits of the card number as the \`accountId\`.
    - For loan extensions, follow the same logic as for loan payments above to determine the correct account ID.

6.  **Credit Card Application**:
    - If the user expresses intent to "apply for a credit card," you MUST use the 'applyForCreditCard' tool.
    - Before calling the tool, you MUST collect all required information: address, date of birth, employment status, employer, and annual income. You already know the user's name is ${currentUser.name}, so do not ask for it.
    - Ask for any missing information conversationally.

7.  **Loan Application**:
    - If the user wants to "apply for a loan," you MUST use the 'applyForLoan' tool.
    - Before calling the tool, collect the desired loan amount, the loan term in months, and the other personal/financial details: address, date of birth, employment status, and annual income. You already know the user's name is ${currentUser.name}, so do not ask for it.
    - Ask for missing information conversationally.

8.  **General Conversation**:
    - For any other queries, provide polite, brief, and helpful responses.
    - Always maintain a friendly and professional tone.
    - VERY IMPORTANT: You MUST respond exclusively in ${langName}. Do not switch languages.`;
  };


  // Voice Mode Functions
  const stopVoiceMode = () => {
    // Increment session ID first to immediately invalidate any pending operations from the old session.
    sessionId.current++;
    
    setIsVoiceMode(false);
    setVoiceState('idle');

    sessionRef.current?.close();
    sessionRef.current = null;
    
    // Disconnect audio graph to stop processing
    audioWorkletNodeRef.current?.port.close();
    audioWorkletNodeRef.current?.disconnect();
    audioWorkletNodeRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;

    // Stop media stream tracks
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    
    // Close audio contexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

    // Clear any pending audio playback
    nextStartTimeRef.current = 0;
    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();
    
    // Reset transcriptions
    setLiveInputTranscription('');
    setLiveOutputTranscription('');
    finalInputTranscription.current = '';
    finalOutputTranscription.current = '';
  };

  const startVoiceMode = async () => {
    // Defensive cleanup of any lingering state from a previous, failed session.
    stopVoiceMode();

    const currentSessionId = sessionId.current;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (sessionId.current !== currentSessionId) { stream.getTracks().forEach(t => t.stop()); return; } // Check if cancelled during permission prompt
        mediaStreamRef.current = stream;
    } catch (err) {
        showToast(t('micAccessDenied'), 'error');
        return;
    }

    setIsVoiceMode(true);
    setVoiceState('connecting');

    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    try {
        const blob = new Blob([audioProcessorCode], { type: 'application/javascript' });
        const objectURL = URL.createObjectURL(blob);
        await inputAudioContextRef.current.audioWorklet.addModule(objectURL);
        URL.revokeObjectURL(objectURL);
    } catch (e) {
        console.error('Failed to load audio worklet module', e);
        showToast(t('voiceError'), 'error');
        stopVoiceMode();
        return;
    }
    
    nextStartTimeRef.current = 0;
    audioSourcesRef.current = new Set();
    
    try {
        const session = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    if (sessionId.current !== currentSessionId) return;

                    setVoiceState('listening');
                    if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
                    
                    mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                    audioWorkletNodeRef.current = new AudioWorkletNode(inputAudioContextRef.current, 'audio-processor');

                    audioWorkletNodeRef.current.port.onmessage = (event) => {
                        if (sessionId.current !== currentSessionId) return; // Stale worklet message, ignore.
                        
                        if (sessionRef.current) {
                           const pcmBuffer = event.data as ArrayBuffer;
                            const pcmBlob: GeminiBlob = {
                                data: encode(new Uint8Array(pcmBuffer)),
                                mimeType: `audio/pcm;rate=${inputAudioContextRef.current?.sampleRate || 16000}`,
                            };
                            sessionRef.current.sendRealtimeInput({ media: pcmBlob });
                        }
                    };

                    mediaStreamSourceRef.current.connect(audioWorkletNodeRef.current);
                    audioWorkletNodeRef.current.connect(inputAudioContextRef.current.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (sessionId.current !== currentSessionId) return;

                    if (message.serverContent?.inputTranscription) {
                        const text = message.serverContent.inputTranscription.text;
                        setLiveInputTranscription(prev => prev + text);
                        finalInputTranscription.current += text;
                    }
                    if (message.serverContent?.outputTranscription) {
                        const text = message.serverContent.outputTranscription.text;
                        setLiveOutputTranscription(prev => prev + text);
                        finalOutputTranscription.current += text;
                    }

                    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64EncodedAudioString && outputAudioContextRef.current) {
                        setVoiceState('speaking');
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), outputAudioContextRef.current, 24000, 1);
                        const source = outputAudioContextRef.current.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputAudioContextRef.current.destination);
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                            if (audioSourcesRef.current.size === 0) {
                                setVoiceState('listening');
                            }
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }

                    if (message.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(s => s.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                    
                    if (message.toolCall) {
                        setVoiceState('processing');
                        for (const call of message.toolCall.functionCalls) {
                            const sensitiveActions = ['initiatePayment', 'makeAccountPayment', 'applyForCreditCard', 'applyForLoan', 'requestPaymentExtension'];
                            let isVerified = true;
                            if (sensitiveActions.includes(call.name)) {
                                isVerified = await verifyCurrentUserWithPasskey();
                            }

                            let resultForModel: object;
                            if (!isVerified) {
                                 resultForModel = { success: false, message: 'User cancelled the action.' };
                            } else {
                                const { resultForModel: res } = await handleFunctionCall(call);
                                resultForModel = res;
                            }
                            
                            if (sessionRef.current && sessionId.current === currentSessionId) {
                                sessionRef.current.sendToolResponse({
                                    functionResponses: { id: call.id, name: call.name, response: { result: resultForModel } }
                                });
                            }
                        }
                    }

                    if (message.serverContent?.turnComplete) {
                        const fullInput = finalInputTranscription.current;
                        const fullOutput = finalOutputTranscription.current;
                        if (fullInput.trim()) {
                            setMessages(prev => [...prev, { id: messageId.current++, sender: 'user', text: fullInput.trim() }]);
                        }
                        if (fullOutput.trim()) {
                             setMessages(prev => [...prev, { id: messageId.current++, sender: 'ai', text: fullOutput.trim() }]);
                        }
                        finalInputTranscription.current = '';
                        finalOutputTranscription.current = '';
                        setLiveInputTranscription('');
                        setLiveOutputTranscription('');
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    if (sessionId.current === currentSessionId) {
                        showToast(t('voiceError'), 'error');
                        stopVoiceMode();
                    }
                },
                onclose: (e: CloseEvent) => {
                    if (sessionId.current === currentSessionId) {
                        stopVoiceMode();
                    }
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                systemInstruction: getVoiceSystemInstruction(),
                tools: [{ functionDeclarations: allFunctionDeclarations }],
                outputAudioTranscription: {},
                inputAudioTranscription: {},
            },
        });
        
        // Critical check: if the user cancelled while the connection was being established, close the new session and exit.
        if (sessionId.current !== currentSessionId) {
            session.close();
            return;
        }

        sessionRef.current = session;

    } catch (error) {
         console.error("Failed to start voice session:", error);
         showToast(t('voiceError'), 'error');
         stopVoiceMode();
    }
  };

  const toggleVoiceMode = () => {
    if (isVoiceMode) {
        stopVoiceMode();
    } else {
        startVoiceMode();
    }
  };

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
            <AnimatePresence>
                {isVoiceMode && (
                     <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950 z-20 flex flex-col justify-between p-6"
                     >
                        <div className="text-center h-1/3 flex flex-col justify-end">
                            <p className="text-lg text-slate-400 min-h-[2.5em]">{liveInputTranscription}</p>
                        </div>
                        <div className="flex flex-col items-center gap-4">
                            <motion.button 
                                onClick={stopVoiceMode} 
                                className="text-white"
                                animate={{
                                    scale: voiceState === 'listening' ? [1, 1.1, 1] : 1,
                                    boxShadow: voiceState === 'speaking' ? '0 0 0 10px rgba(79, 70, 229, 0.4)' : '0 0 0 0px rgba(79, 70, 229, 0)',
                                }}
                                transition={{
                                    scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                                    boxShadow: { duration: 0.5, ease: "easeOut" }
                                }}
                            >
                                {voiceState === 'processing' || voiceState === 'connecting' ? (
                                    <div className="w-24 h-24 rounded-full border-4 border-slate-700 border-t-indigo-500 animate-spin flex items-center justify-center"></div>
                                ) : (
                                    <StopCircleIcon className="w-24 h-24 text-indigo-500" />
                                )}
                            </motion.button>
                            <span className="text-slate-400 text-sm">{t('tapToStop')}</span>
                        </div>
                        <div className="text-center h-1/3 flex flex-col justify-start">
                             <p className="text-xl text-white font-semibold min-h-[3em]">{liveOutputTranscription}</p>
                        </div>
                     </motion.div>
                )}
            </AnimatePresence>
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
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={isLoading} className="w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
                      <CameraIcon className="w-6 h-6" />
                  </button>
                  <button type="button" onClick={toggleVoiceMode} disabled={isLoading} className="w-10 h-12 rounded-lg grid place-items-center flex-shrink-0 transition-colors text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
                      <MicrophoneIcon className="w-6 h-6" />
                  </button>
                  <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={t('askNova')} className="w-full bg-slate-800 border-transparent rounded-lg px-4 py-3 h-12 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isLoading} />
                  <button type="submit" disabled={isLoading || !inputValue.trim()} className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-800 disabled:text-slate-500 transition-colors">
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
