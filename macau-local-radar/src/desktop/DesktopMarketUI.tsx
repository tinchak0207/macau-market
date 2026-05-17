import { useState } from 'react';
import { ChefHat, Radar, ShoppingBag } from 'lucide-react';
import GroceryPanel from '../components/GroceryPanel.tsx';

export default function DesktopMarketUI() {
  const [activeTab, setActiveTab] = useState<'deals' | 'recipes'>('deals');

  return (
    <div className="desktop-sync-shell">
      <div className="desktop-sync-frame">
        <main className="desktop-sync-main">
          <header className="desktop-sync-header liquid-panel">
            <div className="desktop-sync-headerRow">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full liquid-capsule-sm flex items-center justify-center shrink-0">
                  <Radar className="text-[#8CA7D9]" size={24} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-[28px] font-bold tracking-tight text-[#333336] leading-none mb-0.5">
                    買餸
                  </h2>
                  <p className="text-[11px] font-bold text-[#A0A0A5] tracking-[0.12em] uppercase leading-none">
                    澳門人的街市 App
                  </p>
                </div>
              </div>

              <div className="desktop-sync-tablist liquid-glass-tab-bar">
                <button
                  type="button"
                  onClick={() => setActiveTab('deals')}
                  className={`desktop-sync-tab ${activeTab === 'deals' ? 'is-active' : ''}`}
                >
                  <ShoppingBag size={22} strokeWidth={activeTab === 'deals' ? 2 : 1.6} />
                  <span>格價</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('recipes')}
                  className={`desktop-sync-tab ${activeTab === 'recipes' ? 'is-active' : ''}`}
                >
                  <ChefHat size={22} strokeWidth={activeTab === 'recipes' ? 2 : 1.6} />
                  <span>食譜</span>
                </button>
              </div>
            </div>
          </header>

          <section className="desktop-sync-panel-wrap">
            <div className="desktop-sync-panel">
              <GroceryPanel view={activeTab} mode="desktop" />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
