import React, { useState, useEffect, useMemo } from 'react';
import { ChefHat, Store, Search, ChevronDown, ChevronRight, AlertCircle, Info, TrendingDown, Fish, Beef, Leaf, Sprout, Shell, ShoppingBag, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GroceryPanel({ view = 'deals' }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Store all goods dictionary: key = categoryId, value = goods array
  const [allGoods, setAllGoods] = useState<Record<string, any[]>>({});
  const [loadingGoods, setLoadingGoods] = useState(false);
  
  // Searching
  const [searchQuery, setSearchQuery] = useState('');
  
  // Inline Prices Expansion
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [priceData, setPriceData] = useState<Record<string, any[]>>({});
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  
  const [recipes, setRecipes] = useState<any[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchRecipes();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/grocery/categories');
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        setCategories(data.data);
        if (data.data.length > 0) {
          setSelectedCategory(data.data[0].id);
          // Pre-fetch global goods for all categories for fast search
          data.data.forEach((c: any) => fetchGoods(c.id));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGoods = async (categoryId: string) => {
    try {
      const res = await fetch('/api/grocery/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId })
      });
      const data = await res.json();
      if (data && data.data) {
        setAllGoods(prev => ({ ...prev, [categoryId]: data.data }));
      } else {
        setAllGoods(prev => ({ ...prev, [categoryId]: [] }));
      }
    } catch (e) {
      console.error(e);
      setAllGoods(prev => ({ ...prev, [categoryId]: [] }));
    }
  };

  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/grocery/recipes');
      const data = await res.json();
      if (data?.recipes) {
        setRecipes(data.recipes);
        setDbError(null);
      } else if (res.status === 500) {
        setDbError(data.error);
      }
    } catch (e) {
      console.error(e);
      setDbError("System is offline or misconfigured.");
    }
  };

  const toggleItemExpansion = async (itemId: string, itemCategoryId: string) => {
    if (expandedItem === itemId) {
      setExpandedItem(null);
      return;
    }
    setExpandedItem(itemId);
    
    // Fetch prices only if not already fetched
    if (!priceData[itemId]) {
      setLoadingPriceId(itemId);
      try {
        const res = await fetch('/api/grocery/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goods_id: itemId, goods_item_id: itemCategoryId })
        });
        const data = await res.json();
        if (data && data.data) {
          const sortedPrices = data.data.sort((a: any, b: any) => parseFloat(a.price || a.low_catty_price) - parseFloat(b.price || b.low_catty_price));
          setPriceData(prev => ({ ...prev, [itemId]: sortedPrices }));
        }
      } catch (e) {
        console.error(e);
      }
      setLoadingPriceId(null);
    }
  };

  // Filter goods for right pane
  const displayGoods = useMemo(() => {
    if (searchQuery.trim()) {
      // Global search across all fetched categories
      const query = searchQuery.toLowerCase();
      const allItems = Object.values(allGoods).flat();
      return allItems.filter((g: any) => (g.goods_name || g.name_cn || '').toLowerCase().includes(query));
    }
    // No search -> return selected category goods
    return selectedCategory ? (allGoods[selectedCategory] || []) : [];
  }, [allGoods, selectedCategory, searchQuery]);

  const getRelatedRecipes = (itemName: string) => {
    if (!itemName) return [];
    return recipes.filter(r => r.recipe_ingredient?.some((i: any) => i.ingredient_name.includes(itemName) || itemName.includes(i.ingredient_name)));
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 transparent-container">
      
      {view === 'deals' && (
        <div className="flex flex-col h-full min-h-0 relative px-0">
          
          {/* Top Sticky Area: Search */}
          <div className="flex-none z-20 pb-3 sticky top-0 relative">
            {/* Search Capsule */}
            <div className="liquid-capsule-sm p-1.5 mx-0 flex items-center shadow-[0_4px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl bg-white/30 border border-white/40">
              <Search className="ml-4 mr-2 text-[#A0A0A5] shrink-0" size={18} strokeWidth={2.5}/>
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索食材、快速比價..." 
                className="w-full bg-transparent text-[#333336] placeholder-[#A0A0A5] py-2.5 pr-4 text-[16px] outline-none font-medium h-full"
              />
            </div>
          </div>

          {/* Main Two-Column Area */}
          <div className="flex flex-1 min-h-0 relative -mx-4 sm:mx-0">
             
             {/* Left Sidebar (Categories) */}
             {!searchQuery.trim() && (
               <div className="w-[26%] min-w-[85px] max-w-[110px] shrink-0 flex flex-col gap-0.5 overflow-y-auto scrollbar-hide pb-32 pt-2 border-r border-white/5 bg-gradient-to-r from-black/[0.03] to-transparent relative z-10">
                 {categories.map((c) => {
                   const isActive = selectedCategory === c.id;
                   return (
                     <button 
                       key={c.id}
                       onClick={() => { setSelectedCategory(c.id); setExpandedItem(null); }}
                       className={`shrink-0 flex items-center gap-2 py-2.5 px-2.5 transition-all duration-300 mx-1 mb-0.5 rounded-[12px] relative overflow-hidden ${isActive ? 'bg-white/60 shadow-[inset_0_1px_3px_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.02)] backdrop-blur-md' : 'hover:bg-black/[0.03] opacity-80 hover:opacity-100'}`}
                     >
                       <CategoryIcon id={c.id} name={c.name || c.name_cn} isActive={isActive} className="shrink-0" />
                       <span className={`text-[11.5px] leading-none text-left tracking-tight whitespace-nowrap transition-colors ${isActive ? 'font-bold text-[#333336]' : 'font-medium text-[#8e8e93]'}`}>{c.name || c.name_cn}</span>
                     </button>
                   );
                 })}
               </div>
             )}

             {/* Right Content Area (Ingredient List) */}
             <div className="flex-1 overflow-y-auto scrollbar-hide pb-32 touch-pan-y pt-1 px-3 sm:px-1 relative z-0">
                {searchQuery.trim() && (
                  <div className="text-[13px] font-bold text-[#A0A0A5] mb-3 px-2">
                    搜尋結果 ({displayGoods.length})
                  </div>
                )}

                {displayGoods.length === 0 && !allGoods[selectedCategory!] && !searchQuery.trim() && (
                   <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#8e8e93]" size={32} /></div>
                )}
                
                {displayGoods.length === 0 && searchQuery.trim() && (
                  <div className="flex flex-col items-center justify-center py-20 text-[#8e8e93]">
                    <Search size={48} strokeWidth={1} className="opacity-30 mb-3" />
                    <p className="font-medium">找不到相關食材</p>
                  </div>
                )}

                {displayGoods.length > 0 && (
                  <div className="liquid-panel divide-y divide-black/5 overflow-hidden">
                    <AnimatePresence>
                      {displayGoods.map((g, i) => (
                        <motion.div 
                          key={g.goods_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                        >
                          <GoodsItemRow 
                            goods={g} 
                            isExpanded={expandedItem === g.goods_id}
                            isLoadingPrice={loadingPriceId === g.goods_id}
                            prices={priceData[g.goods_id]}
                            relatedRecipes={getRelatedRecipes(g.goods_name || g.name_cn)}
                            onToggle={() => toggleItemExpansion(g.goods_id, g.goods_item_id || selectedCategory!)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
             </div>
          </div>
          
        </div>
      )}

      {view === 'recipes' && (
        <div className="flex flex-col h-full min-h-0 relative">
            <div className="flex-none z-20 pb-4 sticky top-0">
               <div className="liquid-capsule p-4 flex items-center justify-center">
                 <ChefHat className="text-[#D98CB3] mr-2.5" strokeWidth={2.5} size={22} />
                 <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#2c2c2e]">
                    今日煮乜推介
                 </h2>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-hide pb-32 touch-pan-y pt-2">
            {dbError ? (
              <div className="text-center py-16 text-[#A0A0A5] flex flex-col items-center liquid-capsule w-full max-w-xl mx-auto backdrop-blur-3xl shadow-sm border-dashed border-2 border-black/10 bg-black/5">
                <AlertCircle className="mb-4 text-[#4A4A4D] opacity-80" size={48} strokeWidth={1.5} />
                <p className="font-bold text-[16px] text-[#4A4A4D] mb-2">服務器連接錯誤</p>
                <p className="text-[14px] text-[#A0A0A5] max-w-md px-6 text-center leading-relaxed">
                  {dbError}
                </p>
              </div>
            ) : recipes.length > 0 ? (
              <div className="flex flex-col gap-4">
                {recipes.map((r, i) => (
                   <div key={r.id} className="liquid-panel p-5 sm:p-6 relative overflow-hidden group flex flex-col transition-all duration-300">
                     {/* decorative soft gradient spot inside capsule */}
                     <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -mr-20 -mt-20 transition-all duration-700 opacity-50 ${i === 0 ? 'bg-black/10 group-hover:bg-black/20' : 'bg-black/5 group-hover:bg-black/15'} pointer-events-none`}></div>
                     
                     <div className="flex justify-between items-start mb-3 relative z-10 w-full overflow-hidden shrink-0">
                       <p className="text-[11px] text-[#A0A0A5] uppercase tracking-widest font-bold bg-white/40 backdrop-blur-md px-3 py-1 rounded-full">{r.cuisine === 'cantonese' ? '粵菜' : r.cuisine || '推介'}</p>
                       {i === 0 && <span className="text-[10px] font-bold text-[#D98CB3] uppercase flex items-center shrink-0 bg-black/5 backdrop-blur-md px-2.5 py-1 rounded-full"><TrendingDown size={12} className="mr-1" /> 最高性價比</span>}
                     </div>
                     
                     <h3 className="font-bold text-[22px] tracking-tight text-[#333336] mb-2 relative z-10 flex-1 leading-tight flex items-center">
                       {r.name_cn || r.name}
                     </h3>
                     <p className="text-[14px] font-medium text-[#A0A0A5] mb-5 relative z-10 line-clamp-2 leading-relaxed opacity-90">{r.description || ''}</p>
                     
                     <div className="space-y-3 relative z-10 w-full mb-6 bg-white/30 p-4 rounded-[24px]">
                       {r.recipe_ingredient?.map((ing: any, idx: number) => (
                         <div key={idx} className="flex justify-between items-end border-b border-white/30 pb-2 last:border-0 last:pb-0">
                           <div>
                             <span className="font-semibold text-[15px] text-[#4A4A4D] block mb-0.5">{ing.ingredient_name}</span>
                             <span className="text-[#A0A0A5] text-[12px]">{ing.quantity_kg?.toFixed(2) || "0.0"} kg · {ing.cheapest_market ? ing.cheapest_market : '市價估算'}</span>
                           </div>
                           <span className="font-bold text-[#4A4A4D] text-[16px] flex items-baseline">
                             <span className="text-[#A0A0A5] text-[12px] mr-1">$</span>
                             {ing.total_ingredient_cost?.toFixed(1) || "0.0"}
                           </span>
                         </div>
                       ))}
                     </div>
                     
                     <div className="pt-2 flex justify-between items-end relative z-10 mt-auto">
                       <span className="text-[13px] font-bold text-[#A0A0A5] uppercase tracking-[0.15em]">總成本</span>
                       <span className="text-[28px] font-black text-gradient-apple tracking-tight leading-none flex items-baseline">
                         <span className="text-[16px] mr-1 text-[#8e8e93]">$</span>
                         {r.total_cost?.toFixed(1) || "0.0"}
                       </span>
                     </div>
                   </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-[#A0A0A5] flex flex-col items-center">
                <ChefHat className="mb-4 opacity-20" size={48} />
                <p className="font-semibold text-[16px]">暫無推介</p>
              </div>
            )}
            </div>
        </div>
      )}

    </div>
  );
}

// Sub-component for individual item + inline expansion
function GoodsItemRow({ goods, isExpanded, isLoadingPrice, prices, relatedRecipes, onToggle }: any) {
  return (
    <div className={`transition-colors duration-200 first:rounded-t-[24px] last:rounded-b-[24px] ${isExpanded ? 'bg-black/[0.03]' : 'hover:bg-black/[0.02] cursor-pointer'}`}>
      <div 
        className="flex justify-between items-center px-3 py-2.5"
        onClick={onToggle}
      >
        <div className="flex-1 flex justify-between items-center min-w-0 pr-2">
          <span className={`font-bold text-[15px] tracking-tight block truncate transition-colors ${isExpanded ? 'text-[#2c2c2e]' : 'text-[#4A4A4D]'}`}>
            {goods.goods_name || goods.name_cn}
          </span>
          <div className="flex flex-col items-end shrink-0 transition-opacity duration-300">
             {prices && prices.length > 0 && (
                <span className="text-[14px] text-[#A0A0A5] font-medium"><span className="font-bold ml-0.5 mr-0.5 text-[#8CA7D9]">${prices[0].price || prices[0].low_catty_price}</span>/斤</span>
             )}
          </div>
        </div>
        <div className="flex items-center justify-center shrink-0 pl-3">
           <ChevronRight className={`transition-transform duration-300 ease-out text-[#A0A0A5] ${isExpanded ? 'rotate-90' : ''}`} size={18} strokeWidth={2} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
            className="overflow-hidden box-border"
          >
            <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4 relative z-10">
              {/* Prices Section */}
              <div>
                <div className="flex items-center text-[12px] font-bold text-[#A0A0A5] mb-2 uppercase tracking-[0.15em] pl-1">
                  <Store size={14} className="mr-1.5 opacity-70" strokeWidth={2.5}/> 全澳街市最低價
                </div>
                
                {isLoadingPrice ? (
                  <div className="flex items-center text-[14px] text-[#86868b] font-medium py-2 pl-1">
                    <Loader2 size={16} className="animate-spin mr-2" /> 正在抓取實時市價...
                  </div>
                ) : prices ? (
                  <div className="space-y-1.5">
                    {prices.map((p: any, idx: number) => (
                      <div key={idx} className={`flex justify-between items-center group/price px-4 py-2.5 rounded-[20px] transition-all bg-black/[0.02]`}>
                        <span className="text-[15px] text-[#4A4A4D] flex items-center font-semibold">
                          {idx === 0 && (
                            <span className="w-1.5 h-1.5 bg-[#8CA7D9] rounded-full mr-2.5 shadow-[0_0_8px_rgba(140,167,217,0.4)]"></span>
                          )}
                          {!idx && p.market_name}
                          {idx !== 0 && (
                            <span className="w-1.5 h-1.5 bg-[#D1D1D6] rounded-full mr-2.5"></span>
                          )}
                          {idx !== 0 && p.market_name}
                        </span>
                        <div className="text-right flex items-baseline">
                          <span className={`font-bold tracking-tight ${idx === 0 ? 'text-[#2c2c2e] text-[16px]' : 'text-[#8e8e93] text-[15px]'}`}>
                            <span className="text-[13px] opacity-60 mr-0.5">$</span>{p.price || p.low_catty_price}
                          </span>
                          <span className="text-[11px] text-[#A0A0A5] ml-1">/斤</span>
                        </div>
                      </div>
                    ))}
                    {prices.length === 0 && (
                      <div className="text-[14px] text-[#86868b] py-4 flex items-center justify-center opacity-70">
                         <Info size={16} className="mr-2" /> 暫無數據
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Related Recipes Section */}
              {relatedRecipes && relatedRecipes.length > 0 && (
                 <div className="pt-1">
                  <div className="flex items-center text-[12px] font-bold text-[#D98CB3]/90 mb-2 uppercase tracking-[0.15em] pl-1">
                    <ChefHat size={14} className="mr-1.5" strokeWidth={2.5}/> 關聯推介
                  </div>
                  <div className="space-y-1.5">
                    {relatedRecipes.map((r: any) => (
                      <div key={r.id} className="flex justify-between items-center bg-black/[0.03] px-4 py-2.5 rounded-[20px]">
                        <span className="font-semibold text-[14px] text-[#4A4A4D] truncate pr-2">{r.name_cn || r.name}</span>
                        <span className="text-[13px] font-bold text-[#D98CB3] shrink-0">
                           est. ${r.total_cost?.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryIcon({ id, name, isActive, className }: { id?: string | null, name?: string | null, isActive?: boolean, className?: string }) {
  const getIconProps = () => {
    let type = 'default';
    if (name?.includes('魚') || id === '2' || id === '3') type = 'fish';
    else if (name?.includes('肉') || name?.includes('排') || name?.includes('牛') || name?.includes('豬') || id === '5' || id === '6') type = 'meat';
    else if (name?.includes('菜') || name?.includes('豆芽') || name?.includes('蔬') || id === '1' || id === '7') type = 'veg';
    else if (name?.includes('蛋') || name?.includes('豆腐')) type = 'egg';
    else if (name?.includes('海產') || name?.includes('海鮮') || name?.includes('蝦') || name?.includes('蟹') || id === '4') type = 'shell';

    if (!isActive) {
      switch (type) {
        case 'fish': return { type, color: '#8e99ab', bg: '#f4f6F9' };
        case 'meat': return { type, color: '#ab8e8e', bg: '#F9f4f4' };
        case 'veg': return { type, color: '#8eab94', bg: '#f4F9f5' };
        case 'egg': return { type, color: '#aba28e', bg: '#F9f9f4' };
        case 'shell': return { type, color: '#978eab', bg: '#f7f4F9' };
        default: return { type, color: '#A0A0A5', bg: '#f5f5f5' };
      }
    }
    
    switch (type) {
      case 'fish': return { type, color: '#2B5A9E', bg: 'linear-gradient(135deg, #D4E4F7 0%, #ADCFF5 100%)' };
      case 'meat': return { type, color: '#A63C3C', bg: 'linear-gradient(135deg, #F7D4D4 0%, #F5ADAD 100%)' };
      case 'veg': return { type, color: '#2E7D32', bg: 'linear-gradient(135deg, #D4F7D8 0%, #ADF5B6 100%)' };
      case 'egg': return { type, color: '#D99B00', bg: 'linear-gradient(135deg, #FDF0C8 0%, #F9E08A 100%)' };
      case 'shell': return { type, color: '#512DA8', bg: 'linear-gradient(135deg, #E6D4F7 0%, #CBA5F5 100%)' };
      default: return { type, color: '#424242', bg: 'linear-gradient(135deg, #ECECEC 0%, #D4D4D4 100%)' };
    }
  };

  const { type, color, bg } = getIconProps();
  
  const IconComp = {
    fish: Fish,
    meat: Beef,
    veg: Leaf,
    egg: Sprout,
    shell: Shell,
    default: ShoppingBag
  }[type];

  return (
    <div 
      className={`flex items-center justify-center shrink-0 rounded-full transition-all duration-300 ${isActive ? 'w-7 h-7 shadow-sm' : 'w-6 h-6 opacity-60 grayscale-[0.2]'} ${className || ''}`}
      style={{ background: bg }}
    >
      <IconComp size={isActive ? 14 : 12} color={color} strokeWidth={isActive ? 2.5 : 2} />
    </div>
  );
}

