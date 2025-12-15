import React, { useState, useEffect, useMemo, useRef } from 'react';

/**
 * 📢 部署指南 (StackBlitz / Vercel)：
 * 1. 複製此程式碼取代 App.js / App.jsx。
 * 2. 填入您的 firebaseConfig。
 * 3. 若在外部部署，請務必自行申請 Google Gemini API Key 並填入下方的 apiKey 變數中。
 */

// 引入 Firebase 相關模組
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, doc, collection, query, onSnapshot, 
    addDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';

// --- 環境變數處理 ---
const isGeminiEnv = typeof __app_id !== 'undefined';
const appId = isGeminiEnv ? __app_id : 'my-travel-app';
const firebaseConfig = isGeminiEnv && typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {  apiKey: "AIzaSyDmRd_Zeef69qwEJH8kR8MZ0O3J4mftMwo",
    authDomain: "smarttravel-1cc01.firebaseapp.com",
    projectId: "smarttravel-1cc01",
    storageBucket: "smarttravel-1cc01.firebasestorage.app",
    messagingSenderId: "575049200842",
    appId: "1:575049200842:web:693c26a0b1d2f1b7357033",
    measurementId: "G-WJJ70DQ9RX" }; 

// ✅ 正確寫法 (Vite)
const apiKey = import.meta.env.VITE_API_KEY; // API Key (在此環境由系統提供，若獨立部署請填入您的 Key)

// --------------------------------------------------------------------------------
// Helper Functions
// --------------------------------------------------------------------------------

const safeJsonParse = (text) => {
    if (!text) return null;
    try {
        let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        try {
            const jsonMatch = text.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e2) { console.error("JSON Parse Failed:", e2); }
    }
    return null;
};

const getDatesArray = (start, end) => {
    if (!start || !end) return [];
    const arr = [];
    const dt = new Date(start);
    const edt = new Date(end);
    while (dt <= edt) {
        arr.push(new Date(dt).toISOString().split('T')[0]);
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
};

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

// --------------------------------------------------------------------------------
// UI Components
// --------------------------------------------------------------------------------

const Toast = ({ message, type = 'success', onClose }) => {
    useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
    const bgColors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColors[type]} text-white px-6 py-3 rounded-full shadow-xl z-[100] flex items-center animate-bounce-in text-sm md:text-base whitespace-nowrap`}>
            {message}
        </div>
    );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-up">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">取消</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg shadow-lg">確認</button>
                </div>
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Main App
// --------------------------------------------------------------------------------

function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [trips, setTrips] = useState([]);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null); 

    const showToast = (message, type = 'success') => setToast({ message, type });

    useEffect(() => {
        try {
            if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) console.warn("No Firebase Config");
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            setAuth(getAuth(app));
            const unsubscribe = onAuthStateChanged(getAuth(app), async (user) => {
                if (user) { setUserId(user.uid); setIsAuthReady(true); }
                else { 
                    if (typeof __initial_auth_token !== 'undefined') await signInWithCustomToken(getAuth(app), __initial_auth_token);
                    else await signInAnonymously(getAuth(app));
                }
            });
            return () => unsubscribe();
        } catch (e) { setError("資料庫連線失敗"); setIsLoading(false); }
    }, []);

    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/trips`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTrips(fetched);
            setIsLoading(false);
            if (currentTrip) {
                const updated = fetched.find(t => t.id === currentTrip.id);
                if (updated) setCurrentTrip(prev => ({ ...prev, ...updated }));
            }
        }, () => { setError("無法載入資料"); setIsLoading(false); });
        return () => unsubscribe();
    }, [isAuthReady, db, userId, currentTrip?.id]);

    const getUserTripsCollection = () => collection(db, `artifacts/${appId}/users/${userId}/trips`);
    const handleCreateTrip = async (data) => { try { await addDoc(getUserTripsCollection(), { ...data, createdAt: new Date().toISOString(), destinations: [], expenses: [] }); showToast("建立成功！"); } catch(e) { showToast("建立失敗", "error"); } };
    const handleDeleteTrip = async (id) => { try { await deleteDoc(doc(getUserTripsCollection(), id)); if (currentTrip?.id === id) setCurrentTrip(null); showToast("已刪除"); } catch(e) { showToast("刪除失敗", "error"); } };
    const handleUpdateTrip = async (id, data) => await updateDoc(doc(getUserTripsCollection(), id), data);

    if (isLoading) return <div className="flex h-screen items-center justify-center text-indigo-600 font-bold animate-pulse">載入中...</div>;
    if (error) return <div className="flex h-screen items-center justify-center text-red-600">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-20">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white p-4 shadow-lg sticky top-0 z-40">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <h1 className="text-lg md:text-xl font-bold flex items-center tracking-wide truncate">
                        <span className="text-2xl mr-2">🌍</span> {currentTrip ? currentTrip.name : "旅遊計畫通"}
                    </h1>
                    {currentTrip && <button onClick={() => setCurrentTrip(null)} className="text-xs md:text-sm bg-white/10 backdrop-blur-md px-3 py-2 rounded-full hover:bg-white/20 border border-white/20 ml-2">↩ 回列表</button>}
                </div>
            </header>
            <main className="max-w-6xl mx-auto p-2 md:p-8">
                {currentTrip ? 
                    <TripDetail trip={currentTrip} db={db} userId={userId} appId={appId} onUpdate={handleUpdateTrip} showToast={showToast} /> : 
                    <TripList trips={trips} onCreate={handleCreateTrip} onDelete={handleDeleteTrip} onSelect={setCurrentTrip} showToast={showToast} />
                }
            </main>
        </div>
    );
}

// --------------------------------------------------------------------------------
// TripList
// --------------------------------------------------------------------------------
const TripList = ({ trips, onCreate, onDelete, onSelect, showToast }) => {
    const [name, setName] = useState(''); 
    const [startDate, setStartDate] = useState(''); 
    const [durationDays, setDurationDays] = useState(5); 
    const [baseBudget, setBaseBudget] = useState(''); 
    const [targetCurrency, setTargetCurrency] = useState('JPY'); 
    const [budgetInput, setBudgetInput] = useState(''); 
    const [isCalculating, setIsCalculating] = useState(false);
    const [exchangeRateInfo, setExchangeRateInfo] = useState('');

    const [deleteModal, setDeleteModal] = useState({ isOpen: false, tripId: null });
    const endDate = useMemo(() => { if (!startDate) return ''; const d = new Date(startDate); d.setDate(d.getDate() + (parseInt(durationDays) - 1)); return d.toISOString().split('T')[0]; }, [startDate, durationDays]);

    const handleSubmit = (e) => {
        e.preventDefault(); if(!name || !startDate) return;
        const finalBudget = Number(budgetInput) || 0;
        onCreate({ 
            name, startDate, endDate, 
            budget: finalBudget, baseBudget: Number(baseBudget) || 0, 
            currency: targetCurrency, exchangeRate: 1 
        });
        setName(''); setStartDate(''); setDurationDays(5); setBaseBudget(''); setBudgetInput(''); setExchangeRateInfo('');
    };

    const handleCalculateRate = async () => {
        if (!baseBudget) { showToast("請輸入台幣預算", "info"); return; }
        setIsCalculating(true);
        try {
            const prompt = `Convert ${baseBudget} TWD to ${targetCurrency}. Return only the number.`;
            // 這裡保留無 tool 以求快，匯率不需要 search tool 通常很準
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const match = text.match(/[\d,.]+/);
            if (match) {
                const calculated = Math.floor(parseFloat(match[0].replace(/,/g, '')));
                setBudgetInput(calculated.toString());
                setExchangeRateInfo(`匯率約 ${match[0]}, 換算約 ${calculated.toLocaleString()} ${targetCurrency}`);
                showToast("已自動填入！");
            } else { showToast("無法取得匯率", "error"); }
        } catch (err) { showToast("匯率服務異常", "error"); } 
        finally { setIsCalculating(false); }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <ConfirmModal isOpen={deleteModal.isOpen} title="刪除確認" message="確定要刪除嗎？"
                onConfirm={() => { onDelete(deleteModal.tripId); setDeleteModal({ isOpen: false, tripId: null }); }} onCancel={() => setDeleteModal({ isOpen: false, tripId: null })} />
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-indigo-50">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center"><span className="bg-blue-100 text-blue-600 p-2 rounded-lg mr-3">✈️</span> 新增旅程</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <input className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200" placeholder="旅行名稱" value={name} onChange={e=>setName(e.target.value)} required />
                        <div className="flex gap-4">
                            <input type="date" className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200" value={startDate} onChange={e=>setStartDate(e.target.value)} required />
                            <div className="flex items-center flex-1">
                                <input type="number" min="1" className="w-full p-3 bg-gray-50 rounded-l-xl border border-gray-200" value={durationDays} onChange={e=>setDurationDays(e.target.value)} required />
                                <span className="bg-gray-100 p-3 rounded-r-xl border border-gray-200 text-xs text-gray-500 whitespace-nowrap">天 ({endDate})</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3">
                        <label className="block text-xs font-bold text-blue-800">💰 預算設定 (TWD → 外幣)</label>
                        <div className="flex gap-2 items-center">
                            <input type="number" className="flex-1 p-2 bg-white rounded-lg border border-blue-200 text-sm" placeholder="台幣預算" value={baseBudget} onChange={e=>setBaseBudget(e.target.value)} />
                            <span className="text-gray-400">➔</span>
                            <select className="w-20 p-2 bg-white rounded-lg border border-blue-200 font-bold text-sm" value={targetCurrency} onChange={e=>setTargetCurrency(e.target.value)}>
                                <option value="JPY">JPY</option><option value="USD">USD</option><option value="KRW">KRW</option><option value="EUR">EUR</option><option value="TWD">TWD</option>
                            </select>
                            <button type="button" onClick={handleCalculateRate} disabled={isCalculating} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm disabled:bg-gray-400 whitespace-nowrap">{isCalculating ? '...' : '🔄 試算'}</button>
                        </div>
                        <div className="relative">
                            <input type="number" className="w-full p-3 bg-white rounded-xl border border-blue-300 font-bold text-blue-900" placeholder={`最終預算 (${targetCurrency})`} value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} required />
                            <span className="absolute right-3 top-3 text-gray-400 text-sm">{targetCurrency}</span>
                        </div>
                        {exchangeRateInfo && <p className="text-xs text-blue-600">{exchangeRateInfo}</p>}
                    </div>
                    <div className="md:col-span-2"><button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:shadow-lg">建立旅程</button></div>
                </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trips.map(trip => (
                    <div key={trip.id} onClick={() => onSelect(trip)} className="group bg-white p-5 rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 cursor-pointer relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-lg text-gray-800 truncate">{trip.name}</h3>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, tripId: trip.id }); }} className="text-gray-300 hover:text-red-500">🗑️</button>
                        </div>
                        <p className="text-sm text-gray-500">{trip.startDate} ~ {trip.endDate}</p>
                        <p className="text-sm font-bold text-indigo-600">{trip.currency} {trip.budget.toLocaleString()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// TripDetail
// --------------------------------------------------------------------------------
const TripDetail = ({ trip, db, userId, appId, onUpdate, showToast }) => {
    const [activeTab, setActiveTab] = useState('itinerary');
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, type: null, id: null });
    // State Persistence
    const [itinState, setItinState] = useState({ term: '', results: [], isSearching: false });
    const [mapState, setMapState] = useState({ query: trip.name || 'Japan', input: '', foundPlace: null });
    const [flightState, setFlightState] = useState({ origin: 'TPE', destination: '', date: trip.startDate });
    const [hotelState, setHotelState] = useState({ name: '', checkIn: trip.startDate, checkOut: trip.endDate || trip.startDate });

    const tripRef = doc(db, `artifacts/${appId}/users/${userId}/trips`, trip.id);
    const confirmDelete = async () => {
        if (deleteModal.type === 'destination') await updateDoc(tripRef, { destinations: arrayRemove(trip.destinations.find(d => d.id === deleteModal.id)) });
        else if (deleteModal.type === 'expense') await updateDoc(tripRef, { expenses: arrayRemove(trip.expenses.find(e => e.id === deleteModal.id)) });
        setDeleteModal({ isOpen: false, type: null, id: null }); showToast("已移除");
    };
    const handleAddDay = async () => {
        if(!trip.endDate) return;
        const currentEnd = new Date(trip.endDate); currentEnd.setDate(currentEnd.getDate() + 1);
        await updateDoc(tripRef, { endDate: currentEnd.toISOString().split('T')[0] }); showToast("已增加一天！");
    };

    return (
        <div className="space-y-4">
            <ConfirmModal isOpen={deleteModal.isOpen} title="刪除確認" message="確定移除？" onConfirm={confirmDelete} onCancel={() => setDeleteModal({ isOpen: false, type: null, id: null })} />
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-200 overflow-x-auto md:justify-center sticky top-[60px] z-30 mx-[-0.5rem] md:mx-0 px-2 scrollbar-hide">
                {[
                    { id: 'itinerary', label: '📍 行程' }, { id: 'map', label: '🗺️ 地圖' },
                    { id: 'flights', label: '✈️ 航班' }, { id: 'hotels', label: '🏨 飯店' },
                    { id: 'budget', label: '💰 記帳' }, { id: 'translate', label: '🔤 翻譯' },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 md:flex-none min-w-[70px] py-2 px-3 rounded-xl font-bold text-sm transition whitespace-nowrap mx-1 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}>{tab.label}</button>
                ))}
            </div>
            <div className="min-h-[500px]">
                {activeTab === 'itinerary' && <ItineraryManager trip={trip} tripRef={tripRef} onDelete={(id) => setDeleteModal({isOpen:true, type:'destination', id})} showToast={showToast} state={itinState} setState={setItinState} onAddDay={handleAddDay} />}
                {activeTab === 'map' && <MapExplorer trip={trip} tripRef={tripRef} showToast={showToast} state={mapState} setState={setMapState} />}
                {activeTab === 'flights' && <FlightSearch trip={trip} state={flightState} setState={setFlightState} />}
                {activeTab === 'hotels' && <HotelSearch trip={trip} state={hotelState} setState={setHotelState} showToast={showToast} />}
                {activeTab === 'budget' && <BudgetManager trip={trip} tripRef={tripRef} onDelete={(id) => setDeleteModal({isOpen:true, type:'expense', id})} onUpdate={onUpdate} showToast={showToast} />}
                {activeTab === 'translate' && <TranslationManager showToast={showToast} />}
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// 行程管理器
// --------------------------------------------------------------------------------
const ItineraryManager = ({ trip, tripRef, onDelete, showToast, state, setState, onAddDay }) => {
    const { term, results, isSearching } = state;
    const days = useMemo(() => getDatesArray(trip.startDate, trip.endDate), [trip]);
    const [selectedDate, setSelectedDate] = useState(days[0] || trip.startDate);
    const [durationInput, setDurationInput] = useState('2h');
    const [expandedResultId, setExpandedResultId] = useState(null); 
    const [isManualMode, setIsManualMode] = useState(false);
    
    // 手動模式 State
    const [manualName, setManualName] = useState('');
    const [manualAddress, setManualAddress] = useState('');
    const [manualNote, setManualNote] = useState('');
    const [isAddressLoading, setIsAddressLoading] = useState(false);

    useEffect(() => { if (!days.includes(selectedDate) && days.length > 0) setSelectedDate(days[0]); }, [days, selectedDate]);

    // 一般行程搜尋 (不使用 tool，求快)
    const handleSearch = async (e) => {
        e.preventDefault(); if (!term) return;
        setState(p => ({ ...p, isSearching: true, results: [] }));
        setExpandedResultId(null);
        setIsManualMode(false);
        try {
            const prompt = `
            You are a travel assistant.
            Search for: "${term}" in location: "${trip.name}".
            Return a list of 3-5 distinct places.
            
            CRITICAL: Return ONLY a valid JSON Array. No markdown formatting, no introductory text.
            JSON Format:
            [
              {
                "id": "unique_id",
                "name": "Place Name",
                "address": "Address",
                "type": "Type",
                "rating": "4.5",
                "google_map_query": "Name Address",
                "description": "Short description"
              }
            ]
            `;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const d = await res.json();
            const parsed = safeJsonParse(d.candidates?.[0]?.content?.parts?.[0]?.text);
            if (parsed && Array.isArray(parsed)) setState(p => ({ ...p, results: parsed }));
            else throw new Error("Format Error");
        } catch (err) { console.error(err); showToast("搜尋失敗，請檢查網路或 API Key", "error"); } 
        finally { setState(p => ({ ...p, isSearching: false })); }
    };

    // 手動輸入：AI 自動找地址 (恢復使用 google_search tool 以確保準確性)
    const handleAutoAddress = async () => {
        if (!manualName) { showToast("請先輸入名稱", "error"); return; }
        setIsAddressLoading(true);
        try {
            const prompt = `Find the precise address for "${manualName}" located in "${trip.name}". Return a JSON object: {"found": true, "address": "the address found"} or {"found": false} if not found. Return ONLY JSON.`;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: prompt }] }],
                    tools: [{ google_search: {} }] // 恢復搜尋工具
                })
            });
            const d = await res.json();
            const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = safeJsonParse(text);
            if (parsed && parsed.found && parsed.address) { setManualAddress(parsed.address); showToast("地址已自動填入"); } 
            else { showToast("名稱錯誤或找不到此地點", "error"); }
        } catch (e) { showToast("搜尋錯誤", "error"); } finally { setIsAddressLoading(false); }
    };

    // 手動輸入：Google Map 秒搜
    const handleGoogleMapSearch = () => {
        if (!manualName) { showToast("請先輸入名稱", "error"); return; }
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(manualName + ' ' + trip.name)}`;
        window.open(url, '_blank');
    };

    const addSearchResult = async (place) => {
        await updateDoc(tripRef, { destinations: arrayUnion({ id: crypto.randomUUID(), ...place, cost: 0, date: selectedDate, duration: durationInput }) });
        showToast(`已加入 ${place.name}`);
    };

    const addManualItem = async () => {
        if (!manualName) return;
        const newDest = {
            id: crypto.randomUUID(), name: manualName, address: manualAddress || "自訂地點", type: "自訂",
            query: manualName, cost: 0, date: selectedDate, duration: durationInput, note: manualNote
        };
        await updateDoc(tripRef, { destinations: arrayUnion(newDest) });
        showToast(`已加入 ${manualName}`);
        setManualName(''); setManualAddress(''); setManualNote('');
    };

    const copyText = (text) => {
        const ta = document.createElement("textarea"); ta.value = text; ta.style.position="fixed"; document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); showToast("已複製"); } catch(e){} document.body.removeChild(ta);
    };

    const daily = useMemo(() => (trip.destinations || []).filter(d => d.date === selectedDate).sort((a, b) => a.date.localeCompare(b.date)), [trip.destinations, selectedDate]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-lg border border-indigo-100 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-2">
                        {days.map((day, idx) => (
                            <button key={day} onClick={() => setSelectedDate(day)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border ${selectedDate === day ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}>Day {idx + 1}</button>
                        ))}
                        <button onClick={onAddDay} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-green-200 bg-green-50 text-green-700">＋</button>
                    </div>

                    <div className="flex gap-2 mb-2">
                        <button onClick={() => setIsManualMode(false)} className={`flex-1 py-1 text-sm rounded ${!isManualMode ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500'}`}>🔍 搜尋</button>
                        <button onClick={() => setIsManualMode(true)} className={`flex-1 py-1 text-sm rounded ${isManualMode ? 'bg-orange-100 text-orange-700 font-bold' : 'text-gray-500'}`}>✏️ 手動</button>
                    </div>

                    {!isManualMode ? (
                        <>
                            <form onSubmit={handleSearch} className="flex gap-2 mb-2">
                                <input className="flex-1 p-2 border rounded-lg text-sm" placeholder="搜尋地點..." value={term} onChange={e => setState(p => ({ ...p, term: e.target.value }))} />
                                <button type="submit" disabled={isSearching} className="bg-indigo-600 text-white px-3 rounded-lg text-sm">{isSearching ? '...' : '搜'}</button>
                            </form>
                            <div className="space-y-2">
                                {results.map((place) => {
                                    const isExpanded = expandedResultId === place.id;
                                    return (
                                        <div key={place.id} className={`bg-indigo-50 rounded-xl border border-indigo-200 transition-all ${isExpanded ? 'p-3' : 'p-2'}`}>
                                            <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpandedResultId(isExpanded ? null : place.id)}>
                                                <div className="flex-1">
                                                    <div className="font-bold text-gray-800 text-sm">{place.name}</div>
                                                    {!isExpanded && <p className="text-xs text-gray-500 line-clamp-1">{place.address}</p>}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); copyText(place.name); }} className="text-gray-400 hover:text-indigo-600 px-1">📋</button>
                                                    <button onClick={(e) => { e.stopPropagation(); addSearchResult(place); }} className="bg-green-600 text-white px-2 py-1 rounded text-xs ml-1">＋</button>
                                                    <span className="text-gray-400 text-xs" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="mt-2 pt-2 border-t border-indigo-200 animate-fade-in">
                                                    <p className="text-xs text-gray-600 mb-2">{place.description}</p>
                                                    <div className="w-full h-32 bg-gray-200 rounded-lg overflow-hidden mb-2">
                                                        <iframe width="100%" height="100%" frameBorder="0" src={`https://www.google.com/maps?q=${encodeURIComponent(place.google_map_query)}&output=embed`}></iframe>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3 p-2 bg-orange-50 rounded-xl border border-orange-100">
                            <div className="flex gap-2 items-center">
                                <input className="flex-1 p-2 border rounded text-sm" placeholder="名稱 (如: 101大樓)" value={manualName} onChange={e=>setManualName(e.target.value)} />
                                <button onClick={handleGoogleMapSearch} className="px-2 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold whitespace-nowrap" title="Google Map 找地址">🌏 GMap 找</button>
                                <button onClick={handleAutoAddress} disabled={isAddressLoading} className="px-2 py-2 bg-orange-200 text-orange-800 rounded-lg text-xs font-bold disabled:opacity-50 whitespace-nowrap">{isAddressLoading ? '⏳' : '📍 AI 填'}</button>
                            </div>
                            <input className="w-full p-2 border rounded text-sm" placeholder="地址" value={manualAddress} onChange={e=>setManualAddress(e.target.value)} />
                            <input className="w-full p-2 border rounded text-sm" placeholder="備註" value={manualNote} onChange={e=>setManualNote(e.target.value)} />
                            <button onClick={addManualItem} className="w-full bg-orange-600 text-white py-2 rounded font-bold text-sm">＋ 加入行程</button>
                        </div>
                    )}
                </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
                <h3 className="font-bold text-xl text-gray-700">📅 {selectedDate} 行程</h3>
                {daily.map((dest) => (
                    <div key={dest.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex justify-between relative">
                        <div className="flex-1 pr-8">
                            <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded font-bold mr-2">{dest.duration}</span>
                            <span className="font-bold text-gray-800">{dest.name}</span>
                            <button onClick={() => copyText(dest.name)} className="text-gray-400 hover:text-indigo-600 px-1 ml-1 text-sm">📋</button>
                            <p className="text-sm text-gray-500 mt-1">{dest.address}</p>
                            {dest.note && <p className="text-xs text-indigo-500 mt-1">📝 {dest.note}</p>}
                        </div>
                        <button onClick={() => onDelete(dest.id)} className="text-gray-300 hover:text-red-500">🗑️</button>
                    </div>
                ))}
                {daily.length === 0 && <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">無行程</div>}
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Hotel Search
// --------------------------------------------------------------------------------
const HotelSearch = ({ trip, state, setState, showToast }) => {
    const { name, checkIn, checkOut } = state;
    const copyName = () => {
        const ta = document.createElement("textarea"); ta.value = name || trip.name; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showToast("已複製"); } catch(e){} document.body.removeChild(ta);
    };
    const openLink = (url) => { const win = window.open(url, '_blank'); if(win) win.focus(); };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-2xl mx-auto space-y-4">
            <h3 className="text-xl font-bold text-orange-600">🏨 飯店比價</h3>
            <div className="flex gap-2">
                <input className="flex-1 p-3 border rounded-xl" value={name} onChange={e=>setState(p=>({...p, name: e.target.value}))} placeholder="搜尋飯店..." />
                <button onClick={copyName} className="bg-gray-100 px-3 rounded-xl">📋</button>
            </div>
            <div className="flex gap-4">
                <input type="date" className="flex-1 p-3 border rounded-xl" value={checkIn} onChange={e=>setState(p=>({...p, checkIn: e.target.value}))} />
                <input type="date" className="flex-1 p-3 border rounded-xl" value={checkOut} onChange={e=>setState(p=>({...p, checkOut: e.target.value}))} />
            </div>
            <div className="grid grid-cols-1 gap-3 pt-2">
                <button onClick={() => openLink(`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name || trip.name)}`)} className="w-full p-4 border rounded-xl bg-blue-900 text-white font-bold hover:opacity-90">Booking.com</button>
                <button onClick={() => openLink(`https://www.agoda.com/search?text=${encodeURIComponent(name || trip.name)}`)} className="w-full p-4 border rounded-xl bg-orange-50 text-orange-800 font-bold hover:bg-orange-100">Agoda 訂房</button>
                <button onClick={() => openLink(`https://www.hotelscombined.com.tw/hotels/${encodeURIComponent(name || trip.name)}/${checkIn}/${checkOut}`)} className="w-full p-4 border rounded-xl bg-blue-50 text-blue-800 font-bold hover:bg-blue-100">HotelsCombined 比價</button>
                <button onClick={() => openLink(`https://tc.trip.com/hotels/list?keywords=${encodeURIComponent(name || trip.name)}&checkin=${checkIn}&checkout=${checkOut}`)} className="w-full p-4 border rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700">Trip.com</button>
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Flight Search (連結優化：減少參數以防擋)
// --------------------------------------------------------------------------------
const FlightSearch = ({ trip, state, setState }) => {
    const { origin, destination, date } = state;
    const openLink = (url) => { const win = window.open(url, '_blank'); if(win) win.focus(); };
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-2xl mx-auto space-y-4">
            <h3 className="text-xl font-bold text-blue-800">✈️ 航班比價</h3>
            <div className="flex gap-2">
                <input className="flex-1 p-3 border rounded-xl uppercase" value={origin} onChange={e=>setState(p=>({...p, origin: e.target.value}))} placeholder="TPE" />
                <input className="flex-1 p-3 border rounded-xl uppercase" value={destination} onChange={e=>setState(p=>({...p, destination: e.target.value}))} placeholder="NRT" />
            </div>
            <input type="date" className="w-full p-3 border rounded-xl" value={date} onChange={e=>setState(p=>({...p, date: e.target.value}))} />
            <div className="grid grid-cols-1 gap-2">
                <button onClick={() => openLink(`https://www.google.com/travel/flights?q=Flights%20to%20${destination}%20from%20${origin}%20on%20${date}`)} className="w-full p-4 bg-white border border-blue-200 text-blue-700 rounded-xl font-bold">Google Flights (推薦)</button>
                <button onClick={() => openLink(`https://www.skyscanner.com.tw/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${date.replace(/-/g,'').slice(2)}`)} className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold">Skyscanner</button>
                <button onClick={() => openLink(`https://www.kayak.com.tw/flights/${origin}-${destination}/${date}`)} className="w-full p-4 bg-orange-500 text-white rounded-xl font-bold">Kayak 客亞</button>
                <button onClick={() => openLink(`https://www.expedia.com.tw/Flights-Search?flight-type=on&mode=search&trip=oneway&leg1=from:${origin},to:${destination},departure:${date.split('-').reverse().join('/')}TANYT`)} className="w-full p-4 bg-yellow-400 text-blue-900 rounded-xl font-bold">Expedia</button>
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Translation Manager
// --------------------------------------------------------------------------------
const TranslationManager = ({ showToast }) => {
    const [text, setText] = useState(''); const [res, setRes] = useState(''); const [isListening, setIsListening] = useState(false); const [isTranslating, setIsTranslating] = useState(false); const fileInputRef = useRef(null);
    const handleTranslate = async () => { if (!text) return; setIsTranslating(true); try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `Translate to Traditional Chinese: ${text}` }] }] }) }); const d = await r.json(); setRes(d.candidates?.[0]?.content?.parts?.[0]?.text || "翻譯失敗"); } catch (e) { setResult("連線錯誤"); } finally { setIsTranslating(false); } };
    const startListening = () => { if (!('webkitSpeechRecognition' in window)) { showToast("瀏覽器不支援", "error"); return; } const r = new window.webkitSpeechRecognition(); r.lang = 'zh-TW'; r.onstart=()=>setIsListening(true); r.onend=()=>setIsListening(false); r.onresult=e=>setText(e.results[0][0].transcript); r.start(); };
    const handleImage = async (e) => { const file = e.target.files[0]; if (!file) return; setIsTranslating(true); try { const b64 = await fileToBase64(file); const content = b64.split(',')[1]; const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: "Identify text and translate to Traditional Chinese" }, { inlineData: { mimeType: file.type, data: content } }] }] }) }); const d = await r.json(); setRes(d.candidates?.[0]?.content?.parts?.[0]?.text); } catch(e){} finally { setIsTranslating(false); } };
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-xl mx-auto space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">🌐 全能翻譯</h3>
            <textarea className="w-full border rounded-xl p-3 h-24" value={text} onChange={e=>setText(e.target.value)} placeholder="輸入文字..." />
            <div className="flex gap-2"><button onClick={startListening} className={`flex-1 py-3 rounded-xl font-bold ${isListening?'bg-red-500 text-white':'bg-gray-100'}`}>{isListening?'聆聽中':'🎤 語音'}</button><button onClick={()=>fileInputRef.current.click()} className="flex-1 py-3 rounded-xl font-bold bg-gray-100">📸 圖片</button><input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImage} /></div>
            <button onClick={handleTranslate} disabled={isTranslating} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold">{isTranslating?'...':'翻譯'}</button>
            {res && <div className="p-4 bg-blue-50 rounded-xl whitespace-pre-wrap">{res}</div>}
        </div>
    );
};

// --------------------------------------------------------------------------------
// Other Modules (Budget, Map) - 回歸 AI 建議
// --------------------------------------------------------------------------------
const BudgetManager = ({ trip, tripRef, onDelete, onUpdate, showToast }) => {
    const [desc, setDesc] = useState(''); const [amount, setAmount] = useState(''); const [addAmt, setAddAmt] = useState(''); const [addCurr, setAddCurr] = useState('TWD'); const [aiAdvice, setAiAdvice] = useState('');
    const spent = (trip.expenses||[]).reduce((a,c)=>a+c.amount,0);
    const add = async (e) => { e.preventDefault(); await updateDoc(tripRef, { expenses: arrayUnion({ id: crypto.randomUUID(), description: desc, amount: Number(amount), category: '一般' }) }); setDesc(''); setAmount(''); };
    const handleConvertAdd = async () => { if(!addAmt) return; try { const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: `Convert ${addAmt} ${addCurr} to ${trip.currency}. Return ONLY the number.` }] }] }) }); const d = await res.json(); const val = parseFloat(d.candidates?.[0]?.content?.parts?.[0]?.text.match(/[\d.]+/)?.[0]); if(val) { await onUpdate(trip.id, { budget: trip.budget + Math.floor(val) }); showToast(`已增加 ${Math.floor(val)} ${trip.currency}`); setAddAmt(''); } } catch(e) { showToast("換算失敗", "error"); } };
    // AI 建議 - 確保移除工具參數
    const askAi = async () => { try { const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: `分析預算: 總額${trip.budget}, 已花${spent}. 給簡短建議。` }] }] }) }); const d = await res.json(); setAiAdvice(d.candidates?.[0]?.content?.parts?.[0]?.text); } catch(e){} };

    return (
        <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center"><div className="text-3xl font-bold text-green-600">{(trip.budget - spent).toLocaleString()} <span className="text-sm">{trip.currency}</span></div><div className="text-xs text-gray-400">剩餘預算</div></div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200"><label className="text-xs font-bold text-gray-500 block mb-2">💱 換匯增資</label><div className="flex gap-2"><input type="number" className="flex-1 p-2 border rounded-lg" placeholder="金額" value={addAmt} onChange={e=>setAddAmt(e.target.value)} /><select className="p-2 border rounded-lg bg-white" value={addCurr} onChange={e=>setAddCurr(e.target.value)}><option value="TWD">TWD</option><option value="USD">USD</option><option value="JPY">JPY</option></select><button onClick={handleConvertAdd} className="bg-indigo-600 text-white px-3 rounded-lg">＋</button></div></div>
            <div className="bg-white p-4 rounded-2xl shadow-sm"><form onSubmit={add} className="flex gap-2"><input className="flex-1 border rounded p-2" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="消費項目" /><input type="number" className="w-24 border rounded p-2" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="$" /><button className="bg-green-600 text-white px-4 rounded">記帳</button></form></div>
            
            {/* AI 建議區塊回歸 */}
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <button onClick={askAi} className="text-xs bg-purple-600 text-white px-3 py-1 rounded mb-2">🤖 AI 財務顧問</button>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{aiAdvice || "點擊按鈕獲取分析..."}</div>
            </div>

            <div>{(trip.expenses||[]).map(e=><div key={e.id} className="flex justify-between p-3 border-b bg-white"><span>{e.description}</span><div><span className="font-bold mr-2">{e.amount}</span><button onClick={()=>onDelete(e.id)} className="text-red-500">×</button></div></div>)}</div>
        </div>
    );
};

const MapExplorer = ({ trip, tripRef, showToast, state, setState }) => {
    const { query, input } = state;
    return (
        <div className="h-[500px] bg-white rounded-2xl overflow-hidden flex flex-col">
            <div className="p-3 bg-gray-50 border-b flex gap-2"><input className="flex-1 p-2 border rounded" value={input} onChange={e=>setState(p=>({...p, input: e.target.value}))} placeholder="地圖搜尋" /><button onClick={()=>setState(p=>({...p, query: input}))} className="bg-blue-600 text-white px-4 rounded">Go</button></div>
            <iframe className="flex-1 bg-gray-100" src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`} frameBorder="0"></iframe>
        </div>
    );
};

export default App;
