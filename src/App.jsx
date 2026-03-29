// src/App.jsx
// Bedikat Chametz — v4.0
// Created by Shimon Rosenberg
// In loving memory of יוסף ישראל בן שמעון מאיר ז״ל
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import {
  createRoom, joinRoom, roomExists, updatePiece, logActivity,
  subscribeRoom, saveFcmToken, requestNotificationPermission, onForegroundMessage,
} from './firebase';

// ─── Design tokens ────────────────────────────────────────────────────────────
const SHEETS_URL="https://script.google.com/macros/s/AKfycbypGLLr9gkyVTKzMRLiMSd5WqMaIwW9_WxPrpI6F4I6O6bPT7rQY5uJCzMLNeOeZK8OMw/exec";const C = {
  bg:'#f2f2f7', surface:'#ffffff', surface2:'#f9f9fb', border:'#e5e5ea',
  label:'#636366', muted:'#8e8e93', text:'#1c1c1e',
  blue:'#007AFF', green:'#34c759', orange:'#FF9500', red:'#FF3B30',
  gold:'#FFD60A',
};

const ROOMS=["Kitchen","Living Room","Master Bedroom","Bedroom 2","Bedroom 3","Bedroom 4","Bedroom 5","Dining Room","Hallway","Main Bathroom","Bathroom 2","Bathroom 3","Office","Basement","Attic","Garage","Porch","Other"];

const BRACHA = {
  hebrew:'בָּרוּךְ אַתָּה יְיָ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ עַל בִּיעוּר חָמֵץ',
  translit:'Baruch Atah Adonai Eloheinu Melech ha\'olam, asher kid\'shanu b\'mitzvotav v\'tzivanu al bi\'ur chametz.',
  english:'Blessed are You, L-rd our G‑d, King of the universe, who has sanctified us by His commandments, and has commanded us concerning the removal of chametz.',
};
const BITUL = {
  hebrew:'כָּל חֲמִירָא וַחֲמִיעָא דְּאִכָּא בִרְשׁוּתִי, דְּלָא חֲזִיתֵהּ וּדְלָא בִיעַרְתֵּהּ, לִבְטֵיל וְלֶהֱוֵי הֶפְקֵר כְּעַפְרָא דְאַרְעָא',
  translit:'Kol chamira vachamia d\'ika vir\'shuti, d\'la chazitei ud\'la bi\'artei, libateil v\'lehevei hefker k\'afra d\'ar\'a.',
  english:'All leaven and anything leavened that is in my possession, which I have neither seen nor removed, and about which I am unaware, shall be considered nullified and ownerless as the dust of the earth.',
};

// ─── Hebrew pronunciation phoneme map ─────────────────────────────────────────
// We speak the transliteration slowly with Hebrew-tuned phonetics
function speakHebrew(translit) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(translit);
  // Prefer a Hebrew voice if available, fall back to slow English
  const voices = window.speechSynthesis.getVoices();
  const hebrewVoice = voices.find(v => v.lang.startsWith('he'));
  if (hebrewVoice) {
    // If Hebrew voice exists, speak the actual Hebrew text
    u.text = translit; // use transliteration even with Hebrew voice for clarity
    u.voice = hebrewVoice;
    u.lang = 'he-IL';
  } else {
    u.lang = 'en-US';
  }
  u.rate = 0.72;  // slower for following along
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const genCode = () => Math.random().toString(36).slice(2,7).toUpperCase();
const nowStr  = () => new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const save    = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} };
const load    = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } };

// Mini celebration emojis — rotated per find
const FIND_CELEBRATIONS = ['🕯✨','🎊','⭐️','🌟','✡️✨','🎉','💫','🕎','⚡️','🌠'];

// Compress photo to <200KB for Firebase
function compressPhoto(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale  = Math.min(1, 800 / Math.max(img.width, img.height));
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,       setScreen]       = useState('splash');
  const [userName,     setUserName]     = useState(load('bcName',''));
  const [roomCode,     setRoomCode]     = useState(load('bcRoom',''));
  const [isAdmin,      setIsAdmin]      = useState(load('bcAdmin',false));
  const [roomData,     setRoomData]     = useState(null);
  const [nameIn,       setNameIn]       = useState('');
  const [codeIn,       setCodeIn]       = useState('');
  const [joinMode,     setJoinMode]     = useState(false);
  const [tab,          setTab]          = useState('hide');
  const [editPiece,    setEditPiece]    = useState(null);
  const [viewPiece,    setViewPiece]    = useState(null);  // find clue viewer (no GPS)
  const [showBracha,   setShowBracha]   = useState(false);
  const [showBitul,    setShowBitul]    = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showComplete, setShowComplete] = useState(false); // grand finale modal
  const [miniFete,     setMiniFete]     = useState(null);  // { name, number, room }
  const [guideTab,     setGuideTab]     = useState('quick');
  const [saving,       setSaving]       = useState(false);
  const [snapCount,    setSnapCount]    = useState(0);
  const [toast,        setToast]        = useState('');
  const [loading,      setLoading]      = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);

  const fileRef      = useRef();
  const gpsArr       = useRef([]);
  const unsubRoom    = useRef(null);
  const prevFound    = useRef({});
  const miniFeteTimer= useRef(null);

  // ── Hydrate session on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (userName && roomCode) {
      setLoading('Reconnecting…');
      startSub(roomCode).finally(() => setLoading(''));
    }
  }, []);

  // ── Foreground push → toast ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onForegroundMessage(payload => {
      showToast(payload.notification?.body ?? '🕯 Update from the search!');
    });
    return unsub;
  }, []);

  // ── Watch for newly-found pieces → mini celebration ──────────────────────
  useEffect(() => {
    if (!roomData?.pieces) return;
    const pieces = Object.values(roomData.pieces);

    pieces.forEach(p => {
      const key = `piece_${p.number}`;
      if (p.found && !prevFound.current[key]) {
        // Trigger mini celebration for EVERYONE (this fires on each device via realtime sync)
        triggerMiniFete(p);
      }
    });

    // Update prev state
    prevFound.current = Object.fromEntries(
      pieces.map(p => [`piece_${p.number}`, p.found])
    );

    // Grand finale — all 10 found
    const allFound = pieces.length === 10 && pieces.every(p => p.found);
    if (allFound && screen === 'session') {
      // Delay slightly so mini-fete fires first
      setTimeout(() => setShowComplete(true), 1800);
    }
  }, [roomData]);

  function triggerMiniFete(piece) {
    setMiniFete({ name: piece.foundBy, number: piece.number, room: piece.room });
    if (miniFeteTimer.current) clearTimeout(miniFeteTimer.current);
    miniFeteTimer.current = setTimeout(() => setMiniFete(null), 3200);
  }

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── Firebase subscription ─────────────────────────────────────────────────
  async function startSub(code) {
    if (unsubRoom.current) unsubRoom.current();
    unsubRoom.current = subscribeRoom(code, data => {
      if (data) { setRoomData(data); setScreen('session'); }
      else showToast('Room not found — check the code');
    });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  async function enableNotifs() {
    const token = await requestNotificationPermission();
    if (token) {
      await saveFcmToken(roomCode, userName, token);
      setNotifEnabled(true);
      showToast('🔔 Notifications enabled!');
    } else {
      showToast('Notifications blocked — check browser settings');
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!nameIn.trim()) return showToast('Enter your name first');
    const code = genCode();
    setLoading('Creating room…');
    try {
      await createRoom(code, nameIn.trim());
      save('bcName', nameIn.trim()); save('bcRoom', code); save('bcAdmin', true);
      setUserName(nameIn.trim()); setRoomCode(code); setIsAdmin(true);
      await startSub(code);
      showToast(`Room created! Code: ${code}`);
    } catch { showToast('Error — check Firebase config'); }
    finally   { setLoading(''); }
  }

  async function handleJoin() {
    if (!nameIn.trim()) return showToast('Enter your name first');
    if (!codeIn.trim()) return showToast('Enter the room code');
    const code = codeIn.trim().toUpperCase();
    setLoading('Joining…');
    try {
      const exists = await roomExists(code);
      if (!exists) { setLoading(''); return showToast('Room not found'); }
      await joinRoom(code, nameIn.trim());
      save('bcName', nameIn.trim()); save('bcRoom', code); save('bcAdmin', false);
      setUserName(nameIn.trim()); setRoomCode(code); setIsAdmin(false);
      await startSub(code);
    } catch { showToast('Error joining room'); }
    finally   { setLoading(''); }
  }

  function handleLeave() {
    if (!window.confirm('Leave this room?')) return;
    if (unsubRoom.current) unsubRoom.current();
    save('bcName',''); save('bcRoom',''); save('bcAdmin',false);
    setUserName(''); setRoomCode(''); setIsAdmin(false); setRoomData(null);
    setScreen('splash');
  }

  // ── Precision GPS (5-sample weighted average) ────────────────────────────
  function takePrecisionSnapshot(cb) {
    if (!navigator.geolocation) { cb(null,null,null); return; }
    gpsArr.current = []; let done = 0; const N = 5;
    const tryGet = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          gpsArr.current.push({ lat:pos.coords.latitude, lng:pos.coords.longitude, acc:pos.coords.accuracy });
          done++; setSnapCount(done);
          if (done < N) setTimeout(tryGet, 1400); else finish();
        },
        () => { done++; setSnapCount(done); if (done < N) setTimeout(tryGet, 1400); else finish(); },
        { enableHighAccuracy:true, timeout:6000, maximumAge:0 }
      );
    };
    tryGet();
    function finish() {
      const s = gpsArr.current;
      if (!s.length) { setSnapCount(0); cb(null,null,null); return; }
      const tw  = s.reduce((a,p) => a+(1/Math.max(p.acc,1)), 0);
      const lat = s.reduce((a,p) => a+p.lat*(1/Math.max(p.acc,1)), 0)/tw;
      const lng = s.reduce((a,p) => a+p.lng*(1/Math.max(p.acc,1)), 0)/tw;
      const acc = Math.min(...s.map(p => p.acc));
      setSnapCount(0); cb(lat,lng,acc);
    }
  }

  // ── Hide flow ─────────────────────────────────────────────────────────────
  function capturePhoto(e) {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = async ev => {
      const compressed = await compressPhoto(ev.target.result);
      setEditPiece(p => ({ ...p, photo: compressed }));
    };
    r.readAsDataURL(file);
  }

  async function saveHide() {
    if (!editPiece.room) return showToast('Choose a room first');
    setSaving(true);
    takePrecisionSnapshot(async (lat, lng, accuracy) => {
      try {
        const key  = `piece_${editPiece.number}`;
        const data = { ...editPiece, lat, lng, accuracy, hidden:true, hiddenBy:userName, hiddenAt:nowStr() };
        delete data._mode;
        await updatePiece(roomCode, key, data);
        await logActivity(roomCode, `${userName} hid piece #${editPiece.number} in ${editPiece.room}`);
        setEditPiece(null);
        showToast(lat ? `📍 Piece #${editPiece.number} saved — ±${Math.round(accuracy||10)}m` : `Piece #${editPiece.number} hidden`);
      } catch { showToast('Save failed — check connection'); }
      finally   { setSaving(false); }
    });
  }

  // ── Mark found ────────────────────────────────────────────────────────────
  async function markFound(piece) {
    try {
      await updatePiece(roomCode, `piece_${piece.number}`, {
        found:true, foundBy:userName, foundAt:nowStr()
      });
      await logActivity(roomCode, `🕯 ${userName} found piece #${piece.number} in ${piece.room}!`);
      setViewPiece(null);
    } catch { showToast('Update failed — check connection'); }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const pieces       = roomData?.pieces ? Object.values(roomData.pieces).sort((a,b) => a.number-b.number) : [];
  const hiddenCount  = pieces.filter(p => p.hidden).length;
  const foundCount   = pieces.filter(p => p.found).length;
  const activity     = roomData?.activity ? Object.values(roomData.activity).sort((a,b) => (b.ts||0)-(a.ts||0)).slice(0,25) : [];
  const members      = roomData?.members  ? Object.values(roomData.members) : [];

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      <Styles />

      {/* ── Toast ── */}
      {toast && <div style={S.toast}>{toast}</div>}

      {/* ── Loading bar ── */}
      {loading && <div style={S.loadingBar}><Spinner /> {loading}</div>}

      {/* ── Mini celebration — fires on every device when a piece is found ── */}
      {miniFete && <MiniFete data={miniFete} />}

      {/* ── Grand finale ── */}
      {showComplete && (
        <GrandFinale
          pieces={pieces}
          onBitul={() => { setShowBitul(true); }}
          onClose={() => setShowComplete(false)}
          onReset={isAdmin ? async () => {
            if (!window.confirm('Reset all 10 pieces for a new search?')) return;
            for (let i=1; i<=10; i++) {
              await updatePiece(roomCode, `piece_${i}`, {
                number:i, room:'', note:'', photo:null, lat:null, lng:null, accuracy:null,
                hidden:false, hiddenBy:'', hiddenAt:'', found:false, foundBy:'', foundAt:''
              });
            }
            await logActivity(roomCode, `${userName} reset all pieces for a new search`);
            setShowComplete(false);
          } : null}
        />
      )}

      {/* ════ SPLASH ════════════════════════════════════════════════════════ */}
      {screen==='splash' && (
        <div style={S.splash}>
          <div style={{animation:'fadeUp .6s ease both', textAlign:'center'}}>
            <div style={{fontSize:64, animation:'flicker 2.6s ease-in-out infinite', display:'block', marginBottom:12}}>🕯</div>
            <h1 style={S.splashTitle}>Bedikat<br/>Chametz</h1>
            <p style={S.splashHe}>בְּדִיקַת חָמֵץ</p>
            <p style={S.splashSub}>The Search for Chametz</p>
          </div>
          <div style={{width:'100%', display:'flex', flexDirection:'column', gap:10, animation:'fadeUp .7s .25s ease both', opacity:0}}>
            <Btn primary onClick={() => setScreen('home')}>Begin the Search</Btn>
            <Btn ghost  onClick={() => setScreen('guide')}>About Bedikat Chametz</Btn>{userName&&roomCode&&(<div style={{marginTop:8,padding:"12px",background:"rgba(0,122,255,.08)",borderRadius:14,textAlign:"center"}}><div style={{fontSize:12,color:"#636366"}}>Your active room</div><div style={{fontSize:22,fontWeight:700,letterSpacing:3,color:"#007AFF"}}>{roomCode}</div><button onClick={()=>setScreen("session")} style={{marginTop:8,background:"#007AFF",color:"white",border:"none",borderRadius:10,padding:"8px 20px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Rejoin Search</button></div>)}
          </div>
          <Dedication />
        </div>
      )}

      {/* ════ HOME / AUTH ════════════════════════════════════════════════════ */}
      {screen==='home' && (
        <div style={S.page}>
          <button style={S.backBtn} onClick={() => setScreen('splash')}>‹ Back</button>
          <div style={{textAlign:'center', marginBottom:24}}>
            <div style={{fontSize:42, marginBottom:8}}>🕯</div>
            <h2 style={S.pageH2}>{joinMode ? 'Join a Room' : 'Start a Room'}</h2>
            <p style={{fontSize:14, color:C.label, margin:0}}>Family members share one live session</p>
          </div>
          <FieldLabel>Your name</FieldLabel>
          <input style={S.input} placeholder="e.g. Ari" value={nameIn}
            onChange={e => setNameIn(e.target.value)} maxLength={30}/>
          {joinMode ? <>
            <FieldLabel>Room code</FieldLabel>
            <input style={{...S.input, letterSpacing:5, fontSize:22, textAlign:'center', textTransform:'uppercase'}}
              placeholder="XXXXX" value={codeIn}
              onChange={e => setCodeIn(e.target.value.toUpperCase())} maxLength={5}/>
            <Btn primary onClick={handleJoin} style={{marginTop:8}}>Join Room</Btn>
            <Btn ghost  onClick={() => setJoinMode(false)}>Create a new room instead</Btn>
          </> : <>
            <Btn primary onClick={handleCreate} style={{marginTop:8}}>Create Room</Btn>
            <Btn ghost  onClick={() => setJoinMode(true)}>Join existing room</Btn>
          </>}
          <p style={{fontSize:13, color:C.muted, lineHeight:1.55, marginTop:6}}>
            Share your 5-letter room code with family so everyone tracks the same 10 pieces in real time.
          </p>
        </div>
      )}

      {/* ════ SESSION ════════════════════════════════════════════════════════ */}
      {screen==='session' && (
        <div style={{display:'flex', flexDirection:'column', minHeight:'100vh', paddingBottom:80}}>

          {/* Header */}
          <div style={S.header}>
            <div>
              <div style={{fontSize:18, fontWeight:700}}>🕯 Bedikat Chametz</div>
              <div style={{fontSize:12, color:C.label}}>
                Room <b style={{letterSpacing:1}}>{roomCode}</b> · {userName}
                {members.length > 1 && ` · ${members.length} members`}
              </div>
            </div>
            <div style={{display:'flex', gap:4}}>
              {!notifEnabled && (
                <button className="tappable" style={S.hdrBtn}
                  title="Enable notifications" onClick={enableNotifs}>🔔</button>
              )}
              <button className="tappable" style={S.hdrBtn} onClick={() => setShowActivity(true)}>📋</button>
              <button className="tappable" style={S.hdrBtn} onClick={() => setShowBracha(true)}>✡️</button>
              <button className="tappable" style={S.hdrBtn} onClick={() => setScreen('guide')}>📖</button>
            </div>
          </div>

          {/* Share banner */}
          <div style={S.shareBanner} onClick={() => {
            navigator.clipboard?.writeText(roomCode).then(() => showToast('Room code copied!'));
          }}>
            <span style={{fontWeight:600}}>
              Room Code: <span style={{letterSpacing:3, color:C.blue}}>{roomCode}</span>
            </span>
            <span style={{fontSize:12, color:C.muted}}>Tap to copy & share</span>
          </div>

          {/* Progress bar */}
          <div style={{height:4, background:C.border}}>
            <div style={{height:'100%', background:C.green, width:`${(foundCount/10)*100}%`, transition:'width .5s ease'}}/>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'4px 18px 6px', fontSize:12, color:C.muted}}>
            <span>🫙 {hiddenCount}/10 hidden</span>
            <span>✓ {foundCount}/10 found</span>
          </div>

          {/* Tabs */}
          <div style={{display:'flex', margin:'0 14px 10px', background:C.border, borderRadius:13, padding:3}}>
            {['hide','find'].map(t => (
              <button key={t} className="tappable" onClick={() => setTab(t)}
                style={{flex:1, padding:'9px 0', border:'none', cursor:'pointer', borderRadius:10,
                  fontSize:14, fontWeight:tab===t?600:500,
                  background:tab===t?C.surface:'none',
                  color:tab===t?C.text:C.label,
                  boxShadow:tab===t?'0 1px 4px rgba(0,0,0,.1)':'none',
                  transition:'all .18s'}}>
                {t==='hide' ? `🫙 Hide (${hiddenCount}/10)` : `🔍 Find (${foundCount}/10)`}
              </button>
            ))}
          </div>

          {/* Piece list */}
          <div style={{flex:1, padding:'0 14px', display:'flex', flexDirection:'column', gap:8, paddingBottom:120}}>
            {pieces.map(p => (
              <PieceRow key={p.number} piece={p} mode={tab}
                onHide={() => setEditPiece({...p, _mode:'hide'})}
                onView={() => setViewPiece(p)}
                onFound={() => markFound(p)}/>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={S.bottomBar}>
            <Btn secondary onClick={() => setShowBitul(true)}>Kol Chamira 🙏</Btn>
            <Btn secondary onClick={handleLeave}>Leave</Btn>
            {isAdmin && <Btn danger onClick={async () => {
              if (!window.confirm('Reset all 10 pieces?')) return;
              for (let i=1; i<=10; i++) {
                await updatePiece(roomCode, `piece_${i}`, {
                  number:i, room:'', note:'', photo:null, lat:null, lng:null, accuracy:null,
                  hidden:false, hiddenBy:'', hiddenAt:'', found:false, foundBy:'', foundAt:''
                });
              }
              await logActivity(roomCode, `${userName} reset all pieces`);
              showToast('Reset — hide those pieces!');
            }}>Reset</Btn>}
          </div>
        </div>
      )}

      {/* ════ CLUE VIEWER (replaces proximity finder) ════════════════════════ */}
      {viewPiece && (
        <div style={S.overlay} onClick={e => { if (e.target===e.currentTarget) setViewPiece(null); }}>
          <div style={S.sheet}>
            <div style={S.sheetHdr}>
              <span style={{fontSize:17, fontWeight:700}}>
                Piece #{viewPiece.number} — {viewPiece.room || '?'}
              </span>
              <button style={S.closeBtn} onClick={() => setViewPiece(null)}>✕</button>
            </div>
            <div style={{padding:'16px 20px 32px', display:'flex', flexDirection:'column', gap:14}}>

              {/* Clue card */}
              <div style={{background:C.surface2, borderRadius:16, padding:16}}>
                <div style={{fontSize:12, fontWeight:600, color:C.label, textTransform:'uppercase', letterSpacing:.5, marginBottom:8}}>
                  🏠 Room
                </div>
                <div style={{fontSize:18, fontWeight:600}}>{viewPiece.room || '—'}</div>
              </div>

              {viewPiece.note && (
                <div style={{background:'#FFF9C4', borderRadius:14, padding:'14px 16px', border:'1px solid #FFE082'}}>
                  <div style={{fontSize:12, fontWeight:600, color:'#8a6d00', textTransform:'uppercase', letterSpacing:.5, marginBottom:6}}>
                    💬 Hint
                  </div>
                  <div style={{fontSize:17, color:'#5a4500', lineHeight:1.5}}>{viewPiece.note}</div>
                </div>
              )}

              {viewPiece.photo && (
                <div>
                  <div style={{fontSize:12, fontWeight:600, color:C.label, textTransform:'uppercase', letterSpacing:.5, marginBottom:8}}>
                    📷 Hiding spot photo
                  </div>
                  <img src={viewPiece.photo} alt="hiding spot"
                    style={{width:'100%', borderRadius:14, objectFit:'cover', maxHeight:260, display:'block'}}/>
                </div>
              )}

              {/* Coming soon — proximity finder teaser */}
              <div style={{
                background:'linear-gradient(135deg,#f0f4ff,#e8f0fe)',
                border:'1px solid #c5d3f5',
                borderRadius:14, padding:'14px 16px',
                display:'flex', alignItems:'flex-start', gap:12,
              }}>
                <div style={{fontSize:24, flexShrink:0}}>🧭</div>
                <div>
                  <div style={{fontSize:13, fontWeight:600, color:'#3a5bd9', marginBottom:4}}>
                    Proximity Finder — Coming Soon
                  </div>
                  <div style={{fontSize:12, color:'#5a6ea0', lineHeight:1.55}}>
                    A live GPS compass that glows hotter as you get closer to the piece. Currently in development — indoor GPS accuracy needs to meet our standards before we launch it. For now, use the photo and hint above!
                  </div>
                </div>
              </div>

              <div style={{fontSize:12, color:C.muted, textAlign:'center'}}>
                Hidden by {viewPiece.hiddenBy} · {viewPiece.hiddenAt}
                {viewPiece.accuracy && ` · ±${Math.round(viewPiece.accuracy)}m saved`}
              </div>

              <Btn primary onClick={() => markFound(viewPiece)}>✓ Found It!</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ════ HIDE MODAL ════════════════════════════════════════════════════ */}
      {editPiece && (
        <Modal title={`Hide Piece #${editPiece.number}`} onClose={() => !saving && setEditPiece(null)}>
          <FieldLabel>Room</FieldLabel>
          <select style={S.select} value={editPiece.room}
            onChange={e => setEditPiece(p => ({...p, room:e.target.value}))}>
            <option value="">Select a room…</option>
            {ROOMS.map(r => <option key={r}>{r}</option>)}
          </select>

          <FieldLabel>Hint (optional)</FieldLabel>
          <input style={S.input} placeholder="e.g. behind the lamp"
            value={editPiece.note||''} maxLength={60}
            onChange={e => setEditPiece(p => ({...p, note:e.target.value}))}/>

          <FieldLabel>Photo of hiding spot</FieldLabel>
          <div style={S.photoZone} onClick={() => fileRef.current.click()}>
            {editPiece.photo
              ? <img src={editPiece.photo} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
              : <div style={{textAlign:'center'}}>
                  <div style={{fontSize:32}}>📷</div>
                  <div style={{fontSize:13, color:C.muted, marginTop:4}}>Tap to take photo</div>
                </div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{display:'none'}} onChange={capturePhoto}/>

          <div style={{background:'#EBF5FF', borderRadius:12, padding:'11px 14px',
            fontSize:13, lineHeight:1.5, border:'1px solid #BDDEFF'}}>
            <b>📍 Precision GPS Snapshot</b><br/>
            <span style={{color:C.label}}>
              On Save the app takes 5 GPS readings and averages them — best possible indoor fix. GPS location is saved for the future proximity finder feature.
            </span>
          </div>

          {saving && (
            <div style={{display:'flex', alignItems:'center', gap:10, fontSize:14, color:C.blue}}>
              <Spinner/> Sampling GPS… {snapCount}/5
            </div>
          )}

          <Btn primary onClick={saveHide} disabled={saving} style={{opacity:saving?.85:1}}>
            {saving ? 'Locking Location…' : 'Save Hiding Spot'}
          </Btn>
        </Modal>
      )}

      {/* ════ BRACHA ════════════════════════════════════════════════════════ */}
      {showBracha && (
        <Modal title="The Blessing" onClose={() => setShowBracha(false)}>
          <PrayerBlock data={BRACHA} label="Al Bi'ur Chametz" />
          <Btn primary onClick={() => speakHebrew(BRACHA.translit)} style={{marginTop:4}}>
            
          </Btn>
          <p style={{fontSize:13, color:C.muted, lineHeight:1.55}}>
            Recite before beginning the search. Do not speak unnecessarily until the search is complete.
          </p>
        </Modal>
      )}

      {/* ════ BITUL ═════════════════════════════════════════════════════════ */}
      {showBitul && (
        <Modal title="Kol Chamira — Nullification" onClose={() => setShowBitul(false)}>
          <PrayerBlock data={BITUL} label="After the Search" />
          <Btn primary onClick={() => speakHebrew(BITUL.translit)} style={{marginTop:4}}>
            
          </Btn>
          <p style={{fontSize:13, color:C.muted, lineHeight:1.55}}>
            Recite after the search is complete. Must be understood — recite in a language you know if needed.
          </p>
        </Modal>
      )}

      {/* ════ ACTIVITY FEED ══════════════════════════════════════════════════ */}
      {showActivity && (
        <Modal title="📋 Activity" onClose={() => setShowActivity(false)}>
          {activity.length===0 && (
            <p style={{color:C.muted, fontSize:14, textAlign:'center'}}>No activity yet — start hiding!</p>
          )}
          {activity.map((a,i) => (
            <div key={i} style={{display:'flex', gap:10, padding:'8px 0',
              borderBottom:`1px solid ${C.border}`, fontSize:14}}>
              <span style={{color:C.muted, fontSize:11, flexShrink:0, paddingTop:2}}>
                {a.ts ? new Date(a.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}
              </span>
              <span>{a.message}</span>
            </div>
          ))}
          {members.length > 0 && <>
            <div style={{fontSize:12, fontWeight:600, color:C.label,
              textTransform:'uppercase', letterSpacing:.5, marginTop:10}}>Members</div>
            {members.map((m,i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:14, padding:'4px 0'}}>
                <span style={{fontSize:18}}>👤</span>
                {m.name}
                {m.isAdmin && <span style={{fontSize:11, color:C.blue, fontWeight:600}}>Admin</span>}
                {m.fcmToken && <span style={{fontSize:11, color:C.green}}>🔔</span>}
              </div>
            ))}
          </>}
        </Modal>
      )}

      {/* ════ GUIDE ═════════════════════════════════════════════════════════ */}
      {screen==='guide' && (
        <div style={{display:'flex', flexDirection:'column', minHeight:'100vh'}}>
          <div style={S.header}>
            <div style={{fontSize:18, fontWeight:700}}>📖 Guide</div>
            <button style={S.closeBtn} onClick={() => setScreen(roomData?'session':'splash')}>✕</button>
          </div>
          <div style={{display:'flex', padding:'10px 14px', gap:6,
            overflowX:'auto', borderBottom:`1px solid ${C.border}`}}>
            {[['quick','Quick Start'],['deep','In Depth'],['items','What You Need'],['timing','Timing']].map(([k,v]) => (
              <button key={k} className="tappable"
                style={{flexShrink:0, padding:'7px 15px', border:'none', borderRadius:20,
                  fontSize:13, fontWeight:500, cursor:'pointer',
                  background:guideTab===k?C.blue:C.border,
                  color:guideTab===k?'#fff':C.label}}
                onClick={() => setGuideTab(k)}>{v}</button>
            ))}
          </div>
          <div style={{padding:'0 20px 60px', overflowY:'auto'}}>
            {guideTab==='quick'  && <QuickGuide />}
            {guideTab==='deep'   && <DeepGuide />}
            {guideTab==='items'  && <ItemsGuide />}
            {guideTab==='timing' && <TimingGuide />}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Mini Celebration — fires on all devices when ANY piece is found
// ══════════════════════════════════════════════════════════════════════════════
function MiniFete({ data }) {
  const emoji = FIND_CELEBRATIONS[(data.number - 1) % FIND_CELEBRATIONS.length];
  return (
    <div style={{
      position:'fixed', top:0, left:'50%', transform:'translateX(-50%)',
      width:'100%', maxWidth:430, zIndex:500,
      pointerEvents:'none',
    }}>
      {/* Burst particles */}
      <MiniParticles />
      {/* Banner */}
      <div style={{
        margin:'60px 20px 0',
        background:'rgba(255,255,255,.97)',
        borderRadius:20,
        padding:'16px 20px',
        boxShadow:'0 8px 32px rgba(0,0,0,.18)',
        border:`2px solid ${C.green}`,
        animation:'miniBannerIn .35s cubic-bezier(.34,1.56,.64,1) both',
        display:'flex', alignItems:'center', gap:14,
      }}>
        <div style={{fontSize:36, animation:'miniBounce .5s .35s ease both'}}>{emoji}</div>
        <div>
          <div style={{fontSize:15, fontWeight:700, color:C.green}}>
            Piece #{data.number} Found!
          </div>
          <div style={{fontSize:13, color:C.label, marginTop:2}}>
            {data.foundBy || data.name} found it in {data.room || 'the house'} 🕯
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniParticles() {
  const dots = Array.from({length:18}, (_,i) => ({
    id:i,
    x: 20 + Math.random()*60,
    size: 6 + Math.random()*8,
    delay: Math.random()*.4,
    color: ['#FFD60A','#34c759','#007AFF','#FF9500','#FF3B30'][i%5],
  }));
  return (
    <div style={{position:'absolute', top:0, left:0, right:0, height:120, overflow:'hidden', pointerEvents:'none'}}>
      {dots.map(d => (
        <div key={d.id} style={{
          position:'absolute', left:`${d.x}%`, top:-10,
          width:d.size, height:d.size, borderRadius:'50%',
          background:d.color,
          animation:`miniDrop .9s ${d.delay}s ease-in both`,
        }}/>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Grand Finale Modal — all 10 found
// ══════════════════════════════════════════════════════════════════════════════
function GrandFinale({ pieces, onBitul, onClose, onReset }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:900,
      background:'rgba(0,0,0,.7)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:20,
    }}>
      {/* Full confetti */}
      <GrandConfetti />

      <div style={{
        background:C.surface, borderRadius:24,
        width:'100%', maxWidth:400,
        maxHeight:'90vh', overflowY:'auto',
        padding:'32px 24px 28px',
        textAlign:'center',
        boxShadow:'0 24px 80px rgba(0,0,0,.4)',
        animation:'grandIn .5s cubic-bezier(.34,1.56,.64,1) both',
        position:'relative', zIndex:1,
      }}>
        <div style={{fontSize:56, marginBottom:8}}>🎉</div>
        <div style={{
          fontSize:26, fontWeight:700,
          fontFamily:'"Fraunces",Georgia,serif',
          marginBottom:6,
        }}>All 10 Found!</div>
        <div style={{fontSize:15, color:C.label, marginBottom:20}}>
          Chag Kasher v'Sameach! 🍷
        </div>

        {/* Summary grid */}
        <div style={{
          background:C.surface2, borderRadius:16,
          padding:'4px 0', marginBottom:20,
          textAlign:'left',
        }}>
          {pieces.map(p => (
            <div key={p.number} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'9px 16px',
              borderBottom:`1px solid ${C.bg}`,
              fontSize:14,
            }}>
              <span>
                <span style={{fontWeight:700, color:C.green, marginRight:8}}>#{p.number}</span>
                {p.room}
              </span>
              <span style={{fontSize:12, color:C.muted}}>✓ {p.foundBy}</span>
            </div>
          ))}
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          <Btn primary onClick={onBitul}>Recite Kol Chamira 🙏</Btn>
          {onReset && <Btn secondary onClick={onReset}>New Search</Btn>}
          <Btn ghost onClick={onClose}>Close</Btn>
        </div>

        <p style={{fontSize:12, color:C.muted, marginTop:16, lineHeight:1.6}}>
          Collect all 10 pieces in a paper bag with the feather and wooden spoon. Burn them tomorrow morning before the deadline.
        </p>

        <div style={{
          fontSize:14, color:C.label, marginTop:20,
          fontFamily:'"Fraunces",Georgia,serif',
          lineHeight:1.9, direction:'rtl',
        }}>
          לע״נ יוסף ישראל בן שמעון מאיר ז״ל
        </div>
      </div>
    </div>
  );
}

function GrandConfetti() {
  const dots = Array.from({length:70}, (_,i) => ({
    id:i, x:Math.random()*100, delay:Math.random()*2.5,
    color:['#FFD700','#FF6B6B','#4ECDC4','#007AFF','#96CEB4','#FFD60A','#FF9500'][i%7],
    size:5+Math.random()*10,
    drift:(Math.random()-0.5)*60,
  }));
  return (
    <div style={{position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:0}}>
      {dots.map(d => (
        <div key={d.id} style={{
          position:'absolute', left:`${d.x}%`, top:-20,
          width:d.size, height:d.size,
          borderRadius: d.id%3===0 ? '2px' : '50%',
          background:d.color,
          animation:`grandFall 3s ${d.delay}s ease-in both`,
          '--drift':`${d.drift}px`,
        }}/>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Prayer block — Hebrew prominent, translit below, English smallest
// ══════════════════════════════════════════════════════════════════════════════
function PrayerBlock({ data, label }) {
  return (
    <div style={{background:C.surface2, borderRadius:14, padding:18}}>
      <div style={{fontSize:11, fontWeight:700, color:C.muted,
        textTransform:'uppercase', letterSpacing:.7, marginBottom:14}}>
        {label}
      </div>
      {/* Hebrew — largest, most prominent */}
      <div style={{
        fontSize:22, direction:'rtl', lineHeight:1.85,
        fontWeight:500, color:C.text, marginBottom:14,
        fontFamily:'"Fraunces",Georgia,serif',
        textAlign:'right',
      }}>
        {data.hebrew}
      </div>
      {/* Transliteration — for following along with audio */}
      <div style={{
        fontSize:14, fontStyle:'italic', color:C.label,
        lineHeight:1.7, marginBottom:10,
        borderTop:`1px solid ${C.border}`, paddingTop:10,
      }}>
        {data.translit}
      </div>
      {/* English — reference only, smaller */}
      <div style={{fontSize:13, color:C.muted, lineHeight:1.6}}>
        {data.english}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Piece row
// ══════════════════════════════════════════════════════════════════════════════
function PieceRow({ piece, mode, onHide, onView, onFound }) {
  const color   = piece.found ? C.green : piece.hidden ? C.orange : C.border;
  const icon    = piece.found ? '✓' : piece.hidden ? '🫙' : '○';
  const canHide = mode==='hide' && !piece.hidden;
  const canFind = mode==='find' && piece.hidden && !piece.found;

  return (
    <div style={{
      background:C.surface, borderRadius:14, padding:13,
      display:'flex', justifyContent:'space-between', alignItems:'center',
      boxShadow:'0 1px 3px rgba(0,0,0,.06)',
      borderLeft:`3.5px solid ${color}`,
    }}>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontWeight:700, fontSize:15, color, flexShrink:0}}>{icon} #{piece.number}</span>
          <span style={{fontSize:14, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {piece.room || 'Not hidden yet'}
          </span>
        </div>
        {piece.note && (
          <div style={{fontSize:12, color:C.label, marginTop:2}}>💬 "{piece.note}"</div>
        )}
        {piece.hidden && !piece.found && (
          <div style={{fontSize:11, color:C.muted, marginTop:2}}>
            {piece.hiddenBy} · {piece.hiddenAt}
            {piece.accuracy ? ` · ±${Math.round(piece.accuracy)}m` : ''}
          </div>
        )}
        {piece.found && (
          <div style={{fontSize:11, color:C.green, marginTop:2}}>
            ✓ Found by {piece.foundBy} · {piece.foundAt}
          </div>
        )}
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:8}}>
        {piece.photo && (
          <img src={piece.photo} alt="" style={{width:40, height:40, borderRadius:8, objectFit:'cover'}}/>
        )}
        {canHide && (
          <button className="tappable" onClick={onHide}
            style={{background:C.blue, color:'#fff', border:'none', borderRadius:9,
              padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer'}}>
            Hide
          </button>
        )}
        {canFind && (
          <button className="tappable" onClick={onView}
            style={{background:C.green, color:'#fff', border:'none', borderRadius:9,
              padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer'}}>
            Find
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Primitives
// ══════════════════════════════════════════════════════════════════════════════
function Btn({ children, primary, ghost, secondary, danger, onClick, disabled, style={} }) {
  const base = { border:'none', borderRadius:14, padding:'13px 20px', fontSize:16,
    fontWeight:600, cursor:'pointer', width:'100%', ...style };
  const v = primary   ? { background:C.blue,   color:'#fff' }
          : ghost     ? { background:'none',    color:C.blue, border:`1.5px solid ${C.blue}` }
          : secondary ? { background:C.border,  color:C.text }
          : danger    ? { background:C.red,     color:'#fff' }
          : {};
  return (
    <button className="tappable" style={{...base, ...v, opacity:disabled?.85:1}}
      onClick={onClick} disabled={disabled}>{children}</button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={S.sheet}>
        <div style={S.sheetHdr}>
          <span style={{fontSize:18, fontWeight:700}}>{title}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{padding:'14px 20px', display:'flex', flexDirection:'column', gap:10, paddingBottom:36}}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{fontSize:12, fontWeight:600, color:C.label,
    textTransform:'uppercase', letterSpacing:.6, marginTop:4, marginBottom:2}}>{children}</div>;
}

function Spinner() {
  return <div style={{width:16, height:16, borderRadius:8,
    border:`2.5px solid ${C.blue}`, borderTopColor:'transparent',
    animation:'spin .7s linear infinite', flexShrink:0}}/>;
}

function Dedication() {
  return (
    <div style={{textAlign:'center', borderTop:`1px solid ${C.border}`, paddingTop:18, width:'100%'}}>
      <div style={{fontSize:13, color:C.label, lineHeight:1.9}}>
        In loving memory of<br/>
        <span style={{fontFamily:'"Fraunces",Georgia,serif', fontSize:18,
          color:C.text, direction:'rtl', display:'block', margin:'4px 0'}}>
          יוסף ישראל בן שמעון מאיר ז״ל
        </span>
        who cherished this mitzvah
      </div>
      <div style={{fontSize:11, color:C.muted, marginTop:8, letterSpacing:.3}}>
        Created by Shimon Rosenberg
      </div>
    </div>
  );
}

// ── Guide sections ─────────────────────────────────────────────────────────
const GH3 = ({c}) => <h3 style={{fontFamily:'"Fraunces",Georgia,serif', fontSize:22, fontWeight:600, margin:'22px 0 14px'}}>{c}</h3>;
const GP  = ({c}) => <p  style={{fontSize:14, lineHeight:1.68, color:'#3a3a3c', margin:'0 0 10px'}}>{c}</p>;
const GTip= ({c}) => <div style={{background:'#FFFDE7', border:'1px solid #FFE082', borderRadius:12, padding:'12px 14px', fontSize:13, lineHeight:1.5, marginTop:12}}>{c}</div>;

function GStep({ n, title, children }) {
  return (
    <div style={{display:'flex', gap:14, marginBottom:18}}>
      <div style={{flexShrink:0, width:28, height:28, borderRadius:14, background:C.blue,
        color:'#fff', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center'}}>
        {n}
      </div>
      <div>
        <div style={{fontWeight:600, fontSize:15, marginBottom:4}}>{title}</div>
        <div style={{fontSize:14, color:'#444', lineHeight:1.6}}>{children}</div>
      </div>
    </div>
  );
}

function QuickGuide() {
  return <div>
    <GH3 c="🕯 Quick Start"/>
    <GStep n="1" title="Hide the 10 pieces">Before nightfall, wrap 10 small pieces of bread in paper or plastic. Use the Hide tab — pick a room, add a hint, snap a photo, and the app locks a precision GPS snapshot for the future proximity finder.</GStep>
    <GStep n="2" title="Recite the Blessing">Once night falls, gather the family, light the candle, and tap ✡️ to read and hear the Brachah. Do not speak unnecessarily until the search is complete.</GStep>
    <GStep n="3" title="Search room by room">Switch to the Find tab. Tap any piece to open its clue card — room name, text hint, and hiding photo. Mark it found when you've got it. Everyone's screen updates instantly.</GStep>
    <GStep n="4" title="Recite Kol Chamira">After all 10 are found, tap Kol Chamira. Recite it in a language you understand — English translation is provided.</GStep>
    <GStep n="5" title="Burn in the morning">Paper bag, all 10 pieces, feather, wooden spoon. Burn the next morning before the 5th halachic hour.</GStep>
    <GTip c="💡 The kids love being the searchers — give them flashlights while an adult supervises with the candle!"/>
  </div>;
}

function DeepGuide() {
  return <div>
    <GH3 c="📜 What Is Bedikat Chametz?"/>
    <GP c="Bedikat chametz (בְּדִיקַת חָמֵץ) is the mitzvah of searching one's home for all remaining chametz the night before Passover. Even after thorough pre-Pesach cleaning, this final candlelit search ensures nothing was missed."/>
    <GP c="The search takes place on the night of the 14th of Nissan, after nightfall. When Passover begins Saturday night, it moves to Thursday night."/>
    <h4 style={{fontSize:16, fontWeight:600, margin:'16px 0 6px'}}>Why exactly 10 pieces?</h4>
    <GP c="Since the house is already clean, there may be nothing to find — making the blessing a blessing in vain. Hiding 10 pieces ensures the search always finds something. Recorded in the Or Zarua (c. 1300)."/>
    <h4 style={{fontSize:16, fontWeight:600, margin:'16px 0 6px'}}>The Bitul</h4>
    <GP c="The Kol Chamira declaration legally renounces ownership of any chametz accidentally missed. It must be understood — recite the English if Aramaic is unfamiliar."/>
    <GTip c="📚 Laws codified in Shulchan Aruch, Orach Chaim 431–435."/>
  </div>;
}

function ItemsGuide() {
  const items = [
    ['🕯','Candle','Beeswax candle illuminates corners and crevices. A flashlight may assist or replace it.'],
    ['🪶','Feather','Sweeps crumbs into the wooden spoon.'],
    ['🥄','Wooden Spoon','Holds chametz during the search; burned with it the next morning (wood cannot be kashered).'],
    ['🛍','Paper Bag','Holds all chametz, feather, spoon, and candle stub. Must be paper — it has to burn.'],
    ['🍞','10 Pieces of Bread','Wrapped in paper to prevent crumbs. Hidden before the search begins.'],
    ['📱','This App','Room, hint, photo, and GPS snapshot for every piece — so nothing gets lost.'],
  ];
  return <div>
    <GH3 c="🎒 What You Need"/>
    {items.map(([icon,name,desc]) => (
      <div key={name} style={{display:'flex', gap:14, marginBottom:16}}>
        <div style={{fontSize:28, flexShrink:0, width:40, textAlign:'center'}}>{icon}</div>
        <div>
          <div style={{fontWeight:600, fontSize:15}}>{name}</div>
          <div style={{fontSize:13, color:'#555', marginTop:3, lineHeight:1.5}}>{desc}</div>
        </div>
      </div>
    ))}
  </div>;
}

function TimingGuide() {
  const rows = [
    ['When','Night of the 14th of Nissan, ~45 min after sunset (3 stars appear)'],
    ['Pesach on Saturday night','Search moved to Thursday night'],
    ['Before the search','No absorbing activity or full meal within 30 min of nightfall'],
    ['After the search','Recite Kol Chamira; store chametz safely'],
    ['Burning deadline','Following morning before the 5th halachic hour'],
    ['If you forget','Search the next day — without the Brachah if done after the fact'],
  ];
  return <div>
    <GH3 c="⏱ Timing"/>
    {rows.map(([k,v]) => (
      <div key={k} style={{display:'flex', gap:12, padding:'10px 0',
        borderBottom:`1px solid ${C.border}`, fontSize:14}}>
        <div style={{fontWeight:600, flexShrink:0, width:130}}>{k}</div>
        <div style={{color:'#444', lineHeight:1.5}}>{v}</div>
      </div>
    ))}
    <GTip c="⚠️ Check your local Jewish calendar for the exact biur deadline in your area."/>
  </div>;
}

// ── Styles & animations ────────────────────────────────────────────────────
function Styles() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600&family=DM+Sans:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin:0; background:#f2f2f7; }

    @keyframes flicker {
      0%,100% { filter:drop-shadow(0 0 8px #FF6B00) drop-shadow(0 0 22px #FFD60A) }
      35%      { filter:drop-shadow(0 0 16px #FF3B30) drop-shadow(0 0 36px #FF6B00) }
      70%      { filter:drop-shadow(0 0 5px  #FFD60A) drop-shadow(0 0 14px #FF9500) }
    }
    @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
    @keyframes spin     { to{transform:rotate(360deg)} }
    @keyframes fall     { to{transform:translateY(110vh) rotate(720deg);opacity:0} }

    /* Mini celebration */
    @keyframes miniBannerIn { from{opacity:0;transform:translateY(-24px) scale(.9)} to{opacity:1;transform:none} }
    @keyframes miniBounce   { 0%{transform:scale(.5)}70%{transform:scale(1.2)}100%{transform:scale(1)} }
    @keyframes miniDrop     { to{transform:translateY(130px);opacity:0} }

    /* Grand finale */
    @keyframes grandIn   { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:none} }
    @keyframes grandFall { to{transform:translateY(110vh) translateX(var(--drift)) rotate(540deg);opacity:0} }

    .tappable:active { transform:scale(.96); opacity:.88; transition:transform .08s, opacity .08s; }
  `}</style>;
}

const S = {
  root:{ fontFamily:'"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif',
    background:C.bg, minHeight:'100vh', maxWidth:430, margin:'0 auto',
    color:C.text, position:'relative', overflowX:'hidden' },
  splash:{ minHeight:'100vh', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'space-between', padding:'60px 28px 40px' },
  splashTitle:{ fontFamily:'"Fraunces",Georgia,serif', fontSize:46, fontWeight:600,
    letterSpacing:'-1px', textAlign:'center', lineHeight:1.05, margin:'0 0 10px' },
  splashHe:{ fontFamily:'"Fraunces",Georgia,serif', fontSize:22, color:C.label,
    textAlign:'center', direction:'rtl', margin:'0 0 6px' },
  splashSub:{ fontSize:15, color:C.muted, textAlign:'center', margin:'0 0 32px' },
  page:{ display:'flex', flexDirection:'column', padding:'56px 24px 40px', gap:10, minHeight:'100vh' },
  pageH2:{ fontFamily:'"Fraunces",Georgia,serif', fontSize:26, fontWeight:600, margin:'0 0 4px' },
  backBtn:{ background:'none', border:'none', color:C.blue, fontSize:17,
    cursor:'pointer', padding:0, marginBottom:16, alignSelf:'flex-start' },
  input:{ width:'100%', padding:'13px 15px', borderRadius:13,
    border:`1.5px solid ${C.border}`, fontSize:16, background:C.surface, outline:'none' },
  select:{ width:'100%', padding:'13px 15px', borderRadius:13,
    border:`1.5px solid ${C.border}`, fontSize:16, background:C.surface,
    appearance:'none', outline:'none' },
  photoZone:{ width:'100%', height:130, borderRadius:13, border:`2px dashed ${C.border}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer', overflow:'hidden', background:C.surface2 },
  header:{ display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'50px 18px 10px', background:'rgba(242,242,247,.94)',
    backdropFilter:'blur(12px)', position:'sticky', top:0, zIndex:10,
    borderBottom:`1px solid ${C.border}` },
  hdrBtn:{ background:'none', border:'none', fontSize:22, cursor:'pointer', padding:'6px 8px' },
  shareBanner:{ display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'8px 18px', background:'#EBF5FF', borderBottom:'1px solid #BDDEFF', cursor:'pointer' },
  bottomBar:{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
    width:'100%', maxWidth:430, background:'rgba(242,242,247,.95)',
    backdropFilter:'blur(10px)', padding:'12px 18px 28px',
    display:'flex', gap:8, justifyContent:'center', borderTop:`1px solid ${C.border}` },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.48)',
    display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200 },
  sheet:{ background:C.surface, borderRadius:'22px 22px 0 0',
    width:'100%', maxWidth:430, maxHeight:'94vh', overflowY:'auto' },
  sheetHdr:{ display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'20px 20px 14px', borderBottom:`1px solid ${C.bg}` },
  closeBtn:{ background:'none', border:'none', fontSize:18, cursor:'pointer',
    color:C.muted, padding:'4px 8px' },
  toast:{ position:'fixed', top:54, left:'50%', transform:'translateX(-50%)',
    background:'rgba(28,28,30,.9)', color:'#fff', borderRadius:22,
    padding:'10px 22px', fontSize:14, fontWeight:500, zIndex:999,
    whiteSpace:'nowrap', backdropFilter:'blur(8px)', animation:'fadeUp .25s ease' },
  loadingBar:{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)',
    width:'100%', maxWidth:430, background:C.blue, color:'#fff',
    padding:'8px 16px', display:'flex', alignItems:'center', gap:10,
    fontSize:14, zIndex:1000 },
};


