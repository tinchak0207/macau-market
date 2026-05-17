import React, { useState } from 'react';
import { ShoppingBag, ChefHat, Radar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GroceryPanel from './components/GroceryPanel';

export default function App() {
  const [activeTab, setActiveTab] = useState('deals');

  return (
    <div className="h-[100dvh] w-screen relative object-cover font-sans overflow-hidden flex flex-col bg-transparent pointer-events-auto">
      {/* Noise Overlay applied to the whole app */}
      <div className="noise-overlay" />
      
      {/* Main Content Area */}
      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col h-full max-h-screen pt-safe">
        
        {/* Floating Header Region */}
        <header className="px-6 pt-6 pb-2 shrink-0 flex flex-col items-center justify-center z-20">
          <div className="flex items-center gap-3">
             <div className="w-11 h-11 rounded-full liquid-capsule-sm flex items-center justify-center shrink-0">
               <Radar className="text-[#8CA7D9]" size={22} strokeWidth={2.5} />
             </div>
             <div className="flex flex-col">
               <h1 className="text-[20px] sm:text-[24px] font-bold tracking-tight text-[#333336] leading-none mb-0.5">
                 買餸
               </h1>
               <p className="text-[9px] font-bold text-[#A0A0A5] tracking-[0.1em] uppercase leading-none">
                 澳門人的買餸App
               </p>
             </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 relative z-10 w-full max-w-lg mx-auto">
          <AnimatePresence mode="popLayout" initial={false}>
             <motion.div 
                key={activeTab} 
                initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: -20 }} 
                transition={{ duration: 0.5, type: 'spring', bounce: 0.2 }}
                className="absolute inset-x-0 top-0 bottom-0 flex flex-col px-4 sm:px-0 overflow-hidden"
              >
               <GroceryPanel view={activeTab} />
             </motion.div>
          </AnimatePresence>
        </main>

        {/* Floating Tab Bar */}
        <div className="absolute bottom-6 sm:bottom-8 left-0 right-0 flex justify-center z-50 px-4 pointer-events-none pb-safe">
             <div className="liquid-glass-tab-bar p-1.5 flex items-center pointer-events-auto">
             <button 
               onClick={() => setActiveTab('deals')}
               className={`flex items-center justify-center px-6 py-3.5 rounded-[100px] transition-all duration-400 ease-out ${activeTab === 'deals' ? 'bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#2c2c2e]' : 'text-[#8e8e93] hover:text-[#2c2c2e]'}`}
             >
               <ShoppingBag size={22} strokeWidth={activeTab === 'deals' ? 2 : 1.5} />
               <motion.span 
                 animate={{ width: activeTab === 'deals' ? 'auto' : 0, opacity: activeTab === 'deals' ? 1 : 0, marginLeft: activeTab === 'deals' ? 8 : 0 }}
                 className="font-semibold text-[15px] overflow-hidden whitespace-nowrap block"
               >
                 今日抵買
               </motion.span>
             </button>
             <button 
               onClick={() => setActiveTab('recipes')}
               className={`flex items-center justify-center px-6 py-3.5 rounded-[100px] transition-all duration-400 ease-out ${activeTab === 'recipes' ? 'bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#2c2c2e]' : 'text-[#8e8e93] hover:text-[#2c2c2e]'}`}
             >
               <ChefHat size={22} strokeWidth={activeTab === 'recipes' ? 2 : 1.5} />
               <motion.span 
                 animate={{ width: activeTab === 'recipes' ? 'auto' : 0, opacity: activeTab === 'recipes' ? 1 : 0, marginLeft: activeTab === 'recipes' ? 8 : 0 }}
                 className="font-semibold text-[15px] overflow-hidden whitespace-nowrap block"
               >
                 今日煮乜
               </motion.span>
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
