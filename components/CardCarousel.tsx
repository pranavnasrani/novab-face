import React, { useContext, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BankContext } from '../App';
import { Card } from '../types';
import { MastercardIcon, VisaIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

const CardFace = ({ card, isFlipped, name }: { card: Card, isFlipped: boolean, name: string }) => {
  const formatCardNumber = (num: string) => {
    return num.match(/.{1,4}/g)?.join(' ') || '';
  };

  return (
    <motion.div 
      className="absolute w-full h-full"
      style={{ transformStyle: 'preserve-3d' }}
      animate={{ rotateY: isFlipped ? 180 : 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Front */}
      <div className={`absolute w-full h-full bg-gradient-to-br ${card.color || 'from-indigo-500 to-purple-600'} rounded-3xl p-5 flex flex-col justify-between text-white shadow-lg`} style={{ backfaceVisibility: 'hidden' }}>
        <div className="flex justify-between items-start">
          <span className="font-semibold text-lg">Nova Bank</span>
          {card.cardType === 'Visa' ? <VisaIcon className="w-16 h-auto" /> : <MastercardIcon className="w-12 h-auto" />}
        </div>
        <div>
          <p className="text-xl font-mono tracking-wider">{formatCardNumber(card.cardNumber)}</p>
          <div className="flex justify-between items-end mt-4 text-sm">
            <span>{name.toUpperCase()}</span>
            <span>{card.expiryDate}</span>
          </div>
        </div>
      </div>
      {/* Back */}
      <div className="absolute w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl text-white shadow-lg" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
        <div className="w-full h-10 bg-black mt-6"></div>
        <div className="text-right p-4">
            <p className="text-sm italic">CVV</p>
            <div className="bg-white h-8 w-24 ml-auto mt-1 rounded flex items-center justify-end pr-2">
                <p className="text-black font-mono">{card.cvv}</p>
            </div>
        </div>
      </div>
    </motion.div>
  );
};


export const CardCarousel = ({ cards, onCardChange }: { cards: Card[]; onCardChange: (index: number) => void; }) => {
  const { currentUser } = useContext(BankContext);
  const [flippedStates, setFlippedStates] = useState<boolean[]>(Array(cards.length).fill(false));
  const [cardIndex, setCardIndex] = useState(0);

  useEffect(() => {
    onCardChange(cardIndex);
  }, [cardIndex, onCardChange]);
  
  if (!currentUser || !cards || cards.length === 0) {
    return (
        <div className="p-4 text-center text-slate-500">
            <p>No cards found.</p>
        </div>
    );
  }
  
  const toggleFlip = (index: number) => {
      setFlippedStates(prev => {
          const newStates = [...prev];
          newStates[index] = !newStates[index];
          return newStates;
      });
  };

  const handleCardTap = (index: number) => {
    if (index === cardIndex) {
      toggleFlip(index);
    } else {
      setCardIndex(index);
      // Reset flip state for the card that is moving away
      setFlippedStates(prev => prev.map(() => false));
    }
  }
  
  const prevCard = () => setCardIndex(i => Math.max(i - 1, 0));
  const nextCard = () => setCardIndex(i => Math.min(i + 1, cards.length - 1));

  return (
    <div className="p-4 relative group h-64 flex items-center justify-center">
      <div 
        className="w-full aspect-[1.586] max-w-xs relative"
        style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
      >
        {cards.map((card, i) => {
          const offset = i - cardIndex;
          const isCurrent = i === cardIndex;

          return (
            <motion.div
              key={card.cardNumber}
              className="w-full h-full absolute cursor-pointer"
              initial={false}
              animate={{
                x: `${offset * 25}%`,
                translateZ: -Math.abs(offset) * 80,
                rotateY: `${offset * -20}deg`,
                zIndex: cards.length - Math.abs(offset),
                opacity: Math.abs(offset) >= 2 ? 0 : 1,
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              onTap={() => handleCardTap(i)}
            >
              <CardFace card={card} isFlipped={isCurrent && flippedStates[i]} name={currentUser.name} />
            </motion.div>
          )
        })}
      </div>

      {cards.length > 1 && (
        <>
          <button
            onClick={prevCard}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/20 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center justify-center z-50 disabled:opacity-30"
            aria-label="Previous card"
            disabled={cardIndex === 0}
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <button
            onClick={nextCard}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/20 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center justify-center z-50 disabled:opacity-30"
            aria-label="Next card"
            disabled={cardIndex === cards.length - 1}
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );
};