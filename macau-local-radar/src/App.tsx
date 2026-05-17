import React, { useState } from 'react';
import { ChefHat, Radar, ShoppingBag } from 'lucide-react';
import GroceryPanel from './components/GroceryPanel';

export default function App() {
  const [activeTab, setActiveTab] = useState<'deals' | 'recipes'>('deals');

  return (
    <div className="h-[100dvh] w-screen relative object-cover font-sans overflow-hidden flex flex-col bg-transparent pointer-events-auto">
      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col h-full max-h-screen pt-safe">
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
                澳門人的街市 App
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 relative z-10 w-full max-w-lg mx-auto">
          <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col px-4 sm:px-0 overflow-hidden">
            <GroceryPanel view={activeTab} mode="mobile" />
          </div>
        </main>

        <div className="absolute bottom-6 sm:bottom-8 left-0 right-0 flex justify-center z-50 px-4 pointer-events-none pb-safe">
          <div className="liquid-glass-tab-bar p-1.5 flex items-center pointer-events-auto">
            <button
              onClick={() => setActiveTab('deals')}
              className={`flex items-center justify-center px-6 py-3.5 rounded-[100px] transition-all duration-200 ease-out ${activeTab === 'deals' ? 'bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#2c2c2e]' : 'text-[#8e8e93] hover:text-[#2c2c2e]'}`}
            >
              <ShoppingBag size={22} strokeWidth={activeTab === 'deals' ? 2 : 1.5} />
              <span
                className={`font-semibold text-[15px] overflow-hidden whitespace-nowrap block transition-[max-width,opacity,margin] duration-200 ${
                  activeTab === 'deals' ? 'max-w-[120px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'
                }`}
              >
                格價
              </span>
            </button>
            <button
              onClick={() => setActiveTab('recipes')}
              className={`flex items-center justify-center px-6 py-3.5 rounded-[100px] transition-all duration-200 ease-out ${activeTab === 'recipes' ? 'bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-[#2c2c2e]' : 'text-[#8e8e93] hover:text-[#2c2c2e]'}`}
            >
              <ChefHat size={22} strokeWidth={activeTab === 'recipes' ? 2 : 1.5} />
              <span
                className={`font-semibold text-[15px] overflow-hidden whitespace-nowrap block transition-[max-width,opacity,margin] duration-200 ${
                  activeTab === 'recipes' ? 'max-w-[120px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'
                }`}
              >
                食譜
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
